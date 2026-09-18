import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = "location-evidence-v1";
const REPORT_DIR = path.join(process.cwd(), "reports");
const REPORT_JSON = path.join(REPORT_DIR, `${VERSION}.json`);
const REPORT_CSV = path.join(REPORT_DIR, `${VERSION}.csv`);
const CONCURRENCY = 16;
const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_500_000;
const MAX_DISCOVERED_PAGES_PER_MERCHANT = 3;

const LOCATION_LINK_PATTERN = /(?:contact|store(?:s|locator)?|location(?:s)?|shop(?:s)?|boutique(?:s)?|showroom(?:s)?|επικοινων|καταστημ|σημει[αο]|τοποθεσ|που\s*θα\s*μας\s*βρειτε)/i;
const PHYSICAL_SCHEMA_TYPES = new Set([
  "AnimalShelter", "AutomotiveBusiness", "ChildCare", "Dentist", "DryCleaningOrLaundry",
  "EmergencyService", "EmploymentAgency", "EntertainmentBusiness", "FinancialService",
  "FoodEstablishment", "GovernmentOffice", "HealthAndBeautyBusiness", "HomeAndConstructionBusiness",
  "InternetCafe", "LegalService", "Library", "LodgingBusiness", "MedicalBusiness", "ProfessionalService",
  "RadioStation", "RealEstateAgent", "RecyclingCenter", "SelfStorage", "ShoppingCenter", "SportsActivityLocation",
  "Store", "TelevisionStation", "TouristInformationCenter", "TravelAgency", "LocalBusiness", "Restaurant",
  "Hotel", "Resort", "CafeOrCoffeeShop", "BarOrPub", "DaySpa", "BeautySalon", "HealthClub",
]);

type JsonObject = Record<string, unknown>;

type AddressCandidate = {
  merchantId: string;
  merchantName: string;
  giftCardId: string;
  sourceUrl: string;
  extractionMethod: "JSON_LD" | "MICRODATA";
  schemaTypes: string[];
  label: string | null;
  streetAddress: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  postalCode: string | null;
  addressCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  normalizedKey: string | null;
  bucket: "SAFE" | "REVIEW";
  reason: string;
  sourceExcerpt: string;
};

type FetchedPage = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  html: string | null;
  title: string | null;
  locationLinks: string[];
  error: string | null;
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const object = value as JsonObject;
    return cleanText(object.name ?? object.value ?? object["@id"]);
  }
  return "";
}

function normalize(value: unknown) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostalCode(value: unknown) {
  const text = cleanText(value);
  const greek = text.match(/\b(\d{3})\s?(\d{2})\b/);
  return greek ? `${greek[1]} ${greek[2]}` : text || null;
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function plausibleGreekCoordinatePair(latitude: number | null, longitude: number | null) {
  if (latitude === null && longitude === null) return true;
  if (latitude === null || longitude === null) return false;
  return latitude >= 34 && latitude <= 42.5 && longitude >= 18 && longitude <= 30;
}

function registeredDomain(value: string) {
  try {
    return getDomain(new URL(value).hostname) || new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function schemaTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return unique(values.flatMap((item) => cleanText(item).split(/[\s,]+/)).filter(Boolean));
}

function hasPhysicalSchemaType(types: string[]) {
  return types.some((type) => PHYSICAL_SCHEMA_TYPES.has(type) || /(?:Store|Restaurant|Hotel|Salon|Spa|Clinic|Museum|Theater|Stadium|Resort|LocalBusiness)$/.test(type));
}

function flattenJsonLd(value: unknown, output: JsonObject[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const object = value as JsonObject;
  output.push(object);
  for (const key of ["@graph", "department", "location", "subOrganization"]) {
    if (object[key]) flattenJsonLd(object[key], output);
  }
  return output;
}

function parseJsonLd(raw: string) {
  const cleaned = raw.trim().replace(/^\s*<!--/, "").replace(/-->\s*$/, "");
  if (!cleaned) return [];
  try {
    return flattenJsonLd(JSON.parse(cleaned));
  } catch {
    return [];
  }
}

function buildCandidate(params: {
  merchantId: string;
  merchantName: string;
  giftCardId: string;
  sourceUrl: string;
  extractionMethod: "JSON_LD" | "MICRODATA";
  entityTypes: string[];
  label: unknown;
  address: JsonObject;
  geo?: JsonObject | null;
}) : AddressCandidate {
  const streetAddress = cleanText(params.address.streetAddress) || null;
  const addressLocality = cleanText(params.address.addressLocality) || null;
  const addressRegion = cleanText(params.address.addressRegion) || null;
  const postalCode = normalizePostalCode(params.address.postalCode);
  const countryText = cleanText(params.address.addressCountry);
  const addressCountry = countryText || (/\.gr$/i.test(registeredDomain(params.sourceUrl)) && postalCode ? "GR" : null);
  const latitude = finiteCoordinate(params.geo?.latitude, -90, 90);
  const longitude = finiteCoordinate(params.geo?.longitude, -180, 180);
  const normalizedKey = streetAddress && addressLocality
    ? stableHash([normalize(streetAddress), normalize(postalCode), normalize(addressLocality), normalize(addressCountry)]).slice(0, 32)
    : null;
  const physicalType = hasPhysicalSchemaType(params.entityTypes);
  const complete = Boolean(streetAddress && addressLocality && postalCode && addressCountry);
  const greekCountry = !addressCountry || /^(?:GR|GRC|Greece|Ελλαδα|Ελλάδα)$/i.test(addressCountry);
  const plausibleCoordinates = plausibleGreekCoordinatePair(latitude, longitude);
  const safe = params.extractionMethod === "JSON_LD" && physicalType && complete && greekCountry && plausibleCoordinates;
  const reason = safe
    ? "OFFICIAL_PHYSICAL_BUSINESS_JSON_LD_WITH_COMPLETE_POSTAL_ADDRESS"
    : !streetAddress || !addressLocality
      ? "INCOMPLETE_ADDRESS"
      : !physicalType
        ? "ORGANIZATION_OR_UNTYPED_ADDRESS_NOT_PROVEN_AS_CUSTOMER_LOCATION"
        : !postalCode
          ? "POSTAL_CODE_MISSING"
          : !greekCountry
            ? "NON_GREEK_LOCATION_REVIEW"
            : !plausibleCoordinates
              ? "INVALID_OR_NON_GREEK_COORDINATES_REVIEW"
            : "STRUCTURED_ADDRESS_REQUIRES_REVIEW";
  const sourceExcerpt = JSON.stringify({
    schemaTypes: params.entityTypes,
    label: cleanText(params.label) || null,
    streetAddress,
    addressLocality,
    addressRegion,
    postalCode,
    addressCountry,
    latitude,
    longitude,
  });
  return {
    merchantId: params.merchantId,
    merchantName: params.merchantName,
    giftCardId: params.giftCardId,
    sourceUrl: params.sourceUrl,
    extractionMethod: params.extractionMethod,
    schemaTypes: params.entityTypes,
    label: cleanText(params.label) || null,
    streetAddress,
    addressLocality,
    addressRegion,
    postalCode,
    addressCountry,
    latitude,
    longitude,
    normalizedKey,
    bucket: safe ? "SAFE" : "REVIEW",
    reason,
    sourceExcerpt,
  };
}

function extractCandidates(page: FetchedPage, merchant: { id: string; name: string; giftCardId: string }) {
  if (!page.ok || !page.html || !page.finalUrl) return [];
  const sourceUrl = page.finalUrl;
  const $ = cheerio.load(page.html);
  const candidates: AddressCandidate[] = [];

  $('script[type="application/ld+json"]').each((_, node) => {
    for (const entity of parseJsonLd($(node).text())) {
      const addresses = Array.isArray(entity.address) ? entity.address : [entity.address];
      for (const rawAddress of addresses) {
        if (!rawAddress || typeof rawAddress !== "object") continue;
        const geo = entity.geo && typeof entity.geo === "object" ? entity.geo as JsonObject : null;
        candidates.push(buildCandidate({
          merchantId: merchant.id,
          merchantName: merchant.name,
          giftCardId: merchant.giftCardId,
          sourceUrl,
          extractionMethod: "JSON_LD",
          entityTypes: schemaTypes(entity["@type"]),
          label: entity.name,
          address: rawAddress as JsonObject,
          geo,
        }));
      }
    }
  });

  $('[itemtype*="PostalAddress"]').each((_, node) => {
    const root = $(node);
    const property = (name: string) => root.find(`[itemprop="${name}"]`).first().attr("content") || root.find(`[itemprop="${name}"]`).first().text();
    const parent = root.closest("[itemtype]");
    candidates.push(buildCandidate({
      merchantId: merchant.id,
      merchantName: merchant.name,
      giftCardId: merchant.giftCardId,
      sourceUrl,
      extractionMethod: "MICRODATA",
      entityTypes: schemaTypes(parent.attr("itemtype")?.split("/").pop()),
      label: parent.find('[itemprop="name"]').first().text(),
      address: {
        streetAddress: property("streetAddress"),
        addressLocality: property("addressLocality"),
        addressRegion: property("addressRegion"),
        postalCode: property("postalCode"),
        addressCountry: property("addressCountry"),
      },
    }));
  });

  const deduplicated = new Map<string, AddressCandidate>();
  for (const candidate of candidates) {
    const key = candidate.normalizedKey || stableHash([candidate.sourceUrl, candidate.sourceExcerpt]);
    const previous = deduplicated.get(key);
    if (!previous || (previous.bucket === "REVIEW" && candidate.bucket === "SAFE")) deduplicated.set(key, candidate);
  }
  return [...deduplicated.values()];
}

async function fetchPage(requestedUrl: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(requestedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DorokartesLocationAudit/1.0 (+https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "el,en;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type");
    if (!contentType?.toLowerCase().includes("text/html")) {
      return { requestedUrl, finalUrl: response.url || null, status: response.status, ok: false, contentType, html: null, title: null, locationLinks: [], error: "NON_HTML_RESPONSE" };
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) {
      return { requestedUrl, finalUrl: response.url || null, status: response.status, ok: false, contentType, html: null, title: null, locationLinks: [], error: "HTML_TOO_LARGE" };
    }
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const $ = cheerio.load(html);
    const finalUrl = response.url || requestedUrl;
    const baseDomain = registeredDomain(finalUrl);
    const links = $("a[href]").map((_, node) => {
      const href = $(node).attr("href");
      const label = cleanText($(node).text());
      if (!href || !LOCATION_LINK_PATTERN.test(`${label} ${href}`)) return null;
      try {
        const url = new URL(href, finalUrl);
        url.hash = "";
        if (!/^https?:$/.test(url.protocol) || registeredDomain(url.toString()) !== baseDomain) return null;
        return url.toString();
      } catch {
        return null;
      }
    }).get().filter((value): value is string => Boolean(value));
    return {
      requestedUrl,
      finalUrl,
      status: response.status,
      ok: response.ok,
      contentType,
      html,
      title: cleanText($("title").first().text()) || null,
      locationLinks: unique(links).slice(0, 12),
      error: response.ok ? null : `HTTP_${response.status}`,
    };
  } catch (error) {
    return { requestedUrl, finalUrl: null, status: null, ok: false, contentType: null, html: null, title: null, locationLinks: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBatch(urls: string[], label: string) {
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  return Promise.all(urls.map((url) => limit(async () => {
    const result = await fetchPage(url);
    completed += 1;
    if (completed % 100 === 0 || completed === urls.length) console.log(`${label}: ${completed}/${urls.length}`);
    return result;
  })));
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", merchant: { status: "ACTIVE" } },
    orderBy: [{ merchant: { name: "asc" } }, { id: "asc" }],
    select: { id: true, officialUrl: true, merchant: { select: { id: true, name: true, websiteUrl: true } } },
  });
  const merchants = cards.map((card) => ({
    id: card.merchant.id,
    name: card.merchant.name,
    websiteUrl: safeUrl(card.merchant.websiteUrl),
    giftCardId: card.id,
    officialUrl: safeUrl(card.officialUrl),
  }));
  const seedUrls = unique(merchants.flatMap((merchant) => [merchant.websiteUrl, merchant.officialUrl]).filter((url): url is string => Boolean(url)));
  const seedPages = await fetchBatch(seedUrls, "Seed pages");
  const seedByRequestedUrl = new Map(seedPages.map((page) => [page.requestedUrl, page]));

  const discoveredByMerchant = new Map<string, string[]>();
  for (const merchant of merchants) {
    const baseDomain = registeredDomain(merchant.websiteUrl || merchant.officialUrl || "");
    const pages = [merchant.websiteUrl, merchant.officialUrl]
      .filter((url): url is string => Boolean(url))
      .map((url) => seedByRequestedUrl.get(url))
      .filter((page): page is FetchedPage => Boolean(page));
    const links = unique(pages.flatMap((page) => page.locationLinks))
      .filter((url) => registeredDomain(url) === baseDomain)
      .slice(0, MAX_DISCOVERED_PAGES_PER_MERCHANT);
    discoveredByMerchant.set(merchant.id, links);
  }

  const discoveredUrls = unique([...discoveredByMerchant.values()].flat()).filter((url) => !seedByRequestedUrl.has(url));
  const discoveredPages = await fetchBatch(discoveredUrls, "Location pages");
  const allPages = [...seedPages, ...discoveredPages];
  const allByRequestedUrl = new Map(allPages.map((page) => [page.requestedUrl, page]));

  const rows = merchants.map((merchant) => {
    const requestedUrls = unique([
      merchant.websiteUrl,
      merchant.officialUrl,
      ...(discoveredByMerchant.get(merchant.id) || []),
    ].filter((url): url is string => Boolean(url)));
    const pages = requestedUrls.map((url) => allByRequestedUrl.get(url)).filter((page): page is FetchedPage => Boolean(page));
    const candidates = pages.flatMap((page) => extractCandidates(page, merchant));
    const byKey = new Map<string, AddressCandidate>();
    for (const candidate of candidates) {
      const key = candidate.normalizedKey || stableHash([candidate.sourceUrl, candidate.sourceExcerpt]);
      const previous = byKey.get(key);
      if (!previous || (previous.bucket === "REVIEW" && candidate.bucket === "SAFE")) byKey.set(key, candidate);
    }
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      giftCardId: merchant.giftCardId,
      websiteUrl: merchant.websiteUrl,
      officialUrl: merchant.officialUrl,
      pages: pages.map((page) => ({ requestedUrl: page.requestedUrl, finalUrl: page.finalUrl, status: page.status, ok: page.ok, title: page.title, error: page.error })),
      candidates: [...byKey.values()],
    };
  });
  const candidates = rows.flatMap((row) => row.candidates);
  const reportWithoutId = {
    version: VERSION,
    mode: "EVIDENCE_ONLY",
    generatedAt: new Date().toISOString(),
    merchantCount: merchants.length,
    fetchedUrlCount: allPages.length,
    successfulUrlCount: allPages.filter((page) => page.ok).length,
    failedUrlCount: allPages.filter((page) => !page.ok).length,
    candidateCount: candidates.length,
    safeCandidateCount: candidates.filter((candidate) => candidate.bucket === "SAFE").length,
    reviewCandidateCount: candidates.filter((candidate) => candidate.bucket === "REVIEW").length,
    rows,
  };
  const report = { ...reportWithoutId, reportId: stableHash(reportWithoutId) };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const csvRows = [
    ["bucket", "merchantId", "merchantName", "giftCardId", "sourceUrl", "method", "schemaTypes", "label", "streetAddress", "city", "region", "postalCode", "country", "latitude", "longitude", "normalizedKey", "reason"],
    ...candidates.map((candidate) => [candidate.bucket, candidate.merchantId, candidate.merchantName, candidate.giftCardId, candidate.sourceUrl, candidate.extractionMethod, candidate.schemaTypes, candidate.label, candidate.streetAddress, candidate.addressLocality, candidate.addressRegion, candidate.postalCode, candidate.addressCountry, candidate.latitude, candidate.longitude, candidate.normalizedKey, candidate.reason]),
  ];
  fs.writeFileSync(REPORT_CSV, `${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  const immutableBase = `${VERSION}-${report.reportId.slice(0, 16)}`;
  fs.copyFileSync(REPORT_JSON, path.join(REPORT_DIR, `${immutableBase}.json`));
  fs.copyFileSync(REPORT_CSV, path.join(REPORT_DIR, `${immutableBase}.csv`));

  console.log("Dorokartes Location Evidence v1");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Merchants: ${report.merchantCount}`);
  console.log(`URLs: ${report.fetchedUrlCount}`);
  console.log(`Successful: ${report.successfulUrlCount}`);
  console.log(`Failed: ${report.failedUrlCount}`);
  console.log(`Candidates: ${report.candidateCount}`);
  console.log(`Safe: ${report.safeCandidateCount}`);
  console.log(`Review: ${report.reviewCandidateCount}`);
  console.log("EVIDENCE ONLY — no database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
