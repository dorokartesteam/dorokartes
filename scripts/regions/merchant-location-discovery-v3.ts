import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as cheerio from "cheerio";

loadEnvConfig(process.cwd());

const CONCURRENCY = 4;
const TIMEOUT_MS = 15000;
const MAX_PAGES_PER_MERCHANT = 12;

type Decision =
  | "SAFE_CANDIDATE"
  | "REVIEW"
  | "REJECT"
  | "NO_WEBSITE"
  | "FETCH_FAILED"
  | "NO_ADDRESS_EVIDENCE";

type Candidate = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string;
  sourceUrl: string;
  sourceType: "JSON_LD" | "MAP_LINK" | "PAGE_TEXT";
  label: string | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: Decision;
  reasons: string[];
  confidence: number;
};

type CrawlResult = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  decision: Decision;
  reasons: string[];
  crawledUrls: string[];
  candidates: Candidate[];
};

const PAGE_PRIORITY: Array<[RegExp, number]> = [
  [/(store-locator|storelocator|stores|store|katast|katasth|καταστ)/i, 100],
  [/(locations?|find-us|where-we-are|our-store|showroom|boutique)/i, 95],
  [/(contact|epikoin|επικοινων)/i, 90],
  [/(about|company|εταιρ|who-we-are)/i, 50],
];

const PAGE_PENALTY: Array<[RegExp, number]> = [
  [/(privacy|terms|shipping|returns?|refund|blog|news|product|cart|checkout|gift)/i, -80],
];

const CUSTOMER_RE =
  /(κατάστημα|καταστημα|store|shop|showroom|boutique|ιατρείο|clinic|spa|restaurant|cafe|hotel|resort|studio|γυμναστήριο|fitness|visit us|find us|ωράριο|opening hours|retail park|σημείο πώλησης|point of sale|venue)/i;

const NON_CUSTOMER_RE =
  /(έδρα|registered office|head ?office|warehouse|αποθήκη|returns?|billing|τιμολόγ|κεντρικ(ή|η) διοίκηση|παραγωγ|factory|εργοστάσιο|logistics|distribution center|νομικ)/i;

const FOREIGN_RE =
  /\b(berlin|germany|deutschland|london|united kingdom|uk\b|united states|usa\b|new york|cyprus|nicosia|limassol|italy|france|spain|netherlands)\b/i;

const PLACEHOLDER_RE =
  /(\[object Object\]|no name|example|dummy|placeholder|οδός παράδειγμα|210\s*0000000|\bA1\b)/i;

const POSTAL_RE = /\b(\d{3})\s?(\d{2})\b/;
const COORD_RE = /(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/;

const GREEK_LOCALITY_HINTS = [
  "athens","αθηνα","piraeus","πειραι","thessaloniki","θεσσαλον",
  "patra","πατρα","heraklion","iraklio","ηρακλει","chania","χανια",
  "rethymno","ρεθυμνο","larisa","λαρισ","volos","βολο","ioannina","ιωαννινα",
  "kalamata","καλαματα","serres","σερρ","kavala","καβαλα","alexandroupoli","αλεξανδρουπο",
  "corfu","kerkyra","κερκυρα","rhodes","rodos","ροδο","mykonos","μυκονο",
  "santorini","θηρα","σαντοριν","chalkida","χαλκιδ","sparti","σπαρτη",
  "karditsa","καρδιτσ","trikala","τρικαλα","nafplio","ναυπλιο","korinth","corinth","κορινθ",
  "marousi","μαρουσι","chalandri","χαλανδρι","kallithea","καλλιθεα","peristeri","περιστερ",
  "nea ionia","νεα ιωνια","ilioupoli","ηλιουπο","glyfada","γλυφαδ","kifisia","κηφισ",
  "elefsina","eleusina","ελευσιν","spata","σπατα","koropi","κορωπ","kalamaria","καλαμαρια",
  "evosmos","ευοσμο","thermi","θερμη","florina","φλωριν","ermoupoli","ερμουπο"
];

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sameHost(a: string, b: string) {
  try {
    const x = new URL(a).hostname.replace(/^www\./, "");
    const y = new URL(b).hostname.replace(/^www\./, "");
    return x === y;
  } catch {
    return false;
  }
}

function cleanText(v: string) {
  return v.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function inferPostal(v: string) {
  const m = v.match(POSTAL_RE);
  return m ? `${m[1]}${m[2]}` : null;
}

function looksGreek(v: string) {
  const n = norm(v);
  if (/\b(greece|greek|ελλαδα|ellada)\b/.test(n)) return true;
  return GREEK_LOCALITY_HINTS.some(x => n.includes(norm(x)));
}

function looksForeign(v: string) {
  return FOREIGN_RE.test(v) && !looksGreek(v);
}

function hasCustomerSignal(v: string) {
  return CUSTOMER_RE.test(v);
}

function hasNonCustomerSignal(v: string) {
  return NON_CUSTOMER_RE.test(v);
}

function scorePageUrl(url: string) {
  let score = 0;
  for (const [re, pts] of PAGE_PRIORITY) if (re.test(url)) score += pts;
  for (const [re, pts] of PAGE_PENALTY) if (re.test(url)) score += pts;
  return score;
}

function extractGoogleMapsText(href: string) {
  try {
    const u = new URL(href);
    const q =
      u.searchParams.get("query") ||
      u.searchParams.get("q") ||
      u.searchParams.get("destination");
    if (q) return decodeURIComponent(q);
  } catch {}
  const at = href.match(/\/place\/([^/]+)/i);
  return at ? decodeURIComponent(at[1].replace(/\+/g, " ")) : null;
}

function classifyAddress(
  sourceType: Candidate["sourceType"],
  sourceUrl: string,
  addressLine: string,
  excerpt: string | null,
  city: string | null,
  postalCode: string | null,
) {
  const reasons: string[] = [];
  const blob = `${addressLine} ${excerpt || ""}`;

  if (PLACEHOLDER_RE.test(blob)) {
    return { decision: "REJECT" as const, reasons: ["Malformed/placeholder address"], confidence: 0 };
  }

  if (looksForeign(blob)) {
    return { decision: "REJECT" as const, reasons: ["Foreign location signal"], confidence: 0 };
  }

  const customer = hasCustomerSignal(blob) || /(store|stores|location|contact|epikoin|katast|showroom|boutique)/i.test(sourceUrl);
  const nonCustomer = hasNonCustomerSignal(blob);
  const hasPostal = !!postalCode;
  const hasNumber = /\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/.test(addressLine) || /(χλμ|km)\s*\d+/i.test(addressLine);

  if (nonCustomer && !customer) {
    return { decision: "REVIEW" as const, reasons: ["HQ/warehouse/legal-only evidence"], confidence: 25 };
  }

  if (!city && !hasPostal) {
    return { decision: "REVIEW" as const, reasons: ["Weak locality/address structure"], confidence: 20 };
  }

  if (sourceType === "MAP_LINK" && customer && (hasPostal || hasNumber)) {
    return { decision: "SAFE_CANDIDATE" as const, reasons: ["Official map/location evidence"], confidence: 90 };
  }

  if (sourceType === "JSON_LD" && hasPostal && hasNumber && !nonCustomer) {
    return { decision: "SAFE_CANDIDATE" as const, reasons: ["Complete official structured address"], confidence: 88 };
  }

  if (sourceType === "PAGE_TEXT" && customer && hasNumber && (hasPostal || city)) {
    return { decision: "SAFE_CANDIDATE" as const, reasons: ["Explicit customer-facing address on official page"], confidence: 84 };
  }

  reasons.push("Evidence found but not strong enough for automatic apply");
  return { decision: "REVIEW" as const, reasons, confidence: 45 };
}

function inferLocalityFromText(v: string) {
  const n = norm(v);
  const aliases: Array<[string[], string]> = [
    [["athens","αθηνα"], "Αθήνα"],
    [["piraeus","πειραι"], "Πειραιάς"],
    [["thessaloniki","θεσσαλον"], "Θεσσαλονίκη"],
    [["patra","πατρα"], "Πάτρα"],
    [["heraklion","iraklio","ηρακλει"], "Ηράκλειο"],
    [["chania","χανια"], "Χανιά"],
    [["rethymno","ρεθυμνο"], "Ρέθυμνο"],
    [["larisa","λαρισ"], "Λάρισα"],
    [["volos","βολο"], "Βόλος"],
    [["ioannina","ιωαννινα"], "Ιωάννινα"],
    [["kalamata","καλαματα"], "Καλαμάτα"],
    [["serres","σερρ"], "Σέρρες"],
    [["kavala","καβαλα"], "Καβάλα"],
    [["alexandroupoli","αλεξανδρουπο"], "Αλεξανδρούπολη"],
    [["rhodes","rodos","ροδο"], "Ρόδος"],
    [["mykonos","μυκονο"], "Μύκονος"],
    [["santorini","θηρα","σαντοριν"], "Σαντορίνη"],
    [["chalkida","χαλκιδ"], "Χαλκίδα"],
    [["sparti","σπαρτη"], "Σπάρτη"],
    [["karditsa","καρδιτσ"], "Καρδίτσα"],
    [["nafplio","ναυπλιο"], "Ναύπλιο"],
    [["corinth","korinth","κορινθ"], "Κόρινθος"],
    [["florina","φλωριν"], "Φλώρινα"],
    [["marousi","μαρουσι"], "Μαρούσι"],
    [["chalandri","χαλανδρι"], "Χαλάνδρι"],
    [["kallithea","καλλιθεα"], "Καλλιθέα"],
    [["peristeri","περιστερ"], "Περιστέρι"],
    [["nea ionia","νεα ιωνια"], "Νέα Ιωνία"],
    [["ilioupoli","ηλιουπο"], "Ηλιούπολη"],
    [["glyfada","γλυφαδ"], "Γλυφάδα"],
    [["kifisia","κηφισ"], "Κηφισιά"],
    [["elefsina","eleusina","ελευσιν"], "Ελευσίνα"],
    [["spata","σπατα"], "Σπάτα"],
    [["koropi","κορωπ"], "Κορωπί"],
    [["kalamaria","καλαμαρια"], "Καλαμαριά"],
    [["evosmos","ευοσμο"], "Εύοσμος"],
    [["thermi","θερμη"], "Θέρμη"],
    [["ermoupoli","ερμουπο"], "Ερμούπολη"],
  ];

  for (const [keys, city] of aliases) {
    if (keys.some(k => n.includes(norm(k)))) return city;
  }
  return null;
}

function splitTextIntoAddressChunks(text: string) {
  const compact = cleanText(text);
  const chunks = compact
    .split(/(?=(?:Διεύθυνση|Address|Κατάστημα|Store|Showroom|Τοποθεσία|Location)\s*:?\s*)/i)
    .map(cleanText)
    .filter(Boolean);

  const out: string[] = [];
  for (const c of chunks) {
    if (POSTAL_RE.test(c) || /\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/.test(c)) {
      out.push(c.slice(0, 420));
    }
  }
  return out.slice(0, 20);
}

function extractJsonLdCandidates(
  $: cheerio.CheerioAPI,
  merchant: any,
  sourceUrl: string,
): Candidate[] {
  const out: Candidate[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];

    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;

      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }

      if (node["@graph"]) stack.push(...(Array.isArray(node["@graph"]) ? node["@graph"] : [node["@graph"]]));

      const addr = node.address;
      if (!addr || typeof addr !== "object") continue;

      const street = cleanText(String(addr.streetAddress || ""));
      const locality = cleanText(String(addr.addressLocality || ""));
      const region = cleanText(String(addr.addressRegion || ""));
      const postal = cleanText(String(addr.postalCode || ""));
      const country =
        cleanText(String(addr.addressCountry?.name || addr.addressCountry || ""));

      const addressLine = cleanText(
        [street, locality, region, postal, country].filter(Boolean).join(", "),
      );

      if (!addressLine) continue;

      const city = locality || inferLocalityFromText(addressLine);
      const lat = Number(node.geo?.latitude);
      const lon = Number(node.geo?.longitude);

      const classified = classifyAddress(
        "JSON_LD",
        sourceUrl,
        addressLine,
        addressLine,
        city || null,
        postal ? postal.replace(/\s/g, "") : inferPostal(addressLine),
      );

      out.push({
        merchantId: merchant.id,
        merchant: merchant.name,
        merchantSlug: merchant.slug,
        websiteUrl: merchant.websiteUrl,
        sourceUrl,
        sourceType: "JSON_LD",
        label: cleanText(String(node.name || "")) || null,
        city: city || null,
        area: null,
        administrativeArea: region || null,
        addressLine,
        postalCode: postal ? postal.replace(/\s/g, "") : inferPostal(addressLine),
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lon) ? lon : null,
        sourceExcerpt: addressLine,
        decision: classified.decision,
        reasons: classified.reasons,
        confidence: classified.confidence,
      });
    }
  });

  return out;
}

function extractMapCandidates(
  $: cheerio.CheerioAPI,
  merchant: any,
  sourceUrl: string,
): Candidate[] {
  const out: Candidate[] = [];

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (!/(google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google)/i.test(href)) return;

    const anchor = cleanText(
      [
        $(el).text(),
        $(el).attr("title"),
        $(el).attr("aria-label"),
        extractGoogleMapsText(href),
      ]
        .filter(Boolean)
        .join(" "),
    );

    if (!anchor || anchor.length < 6) return;

    const city = inferLocalityFromText(anchor);
    const postalCode = inferPostal(anchor);
    const classified = classifyAddress(
      "MAP_LINK",
      sourceUrl,
      anchor,
      anchor,
      city,
      postalCode,
    );

    out.push({
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl,
      sourceType: "MAP_LINK",
      label: null,
      city,
      area: null,
      administrativeArea: null,
      addressLine: anchor,
      postalCode,
      latitude: null,
      longitude: null,
      sourceExcerpt: anchor,
      decision: classified.decision,
      reasons: classified.reasons,
      confidence: classified.confidence,
    });
  });

  return out;
}

function extractPageTextCandidates(
  $: cheerio.CheerioAPI,
  merchant: any,
  sourceUrl: string,
): Candidate[] {
  const out: Candidate[] = [];

  $("script,style,noscript,svg").remove();

  const texts: string[] = [];

  $("address,[itemprop='address'],[itemprop='streetAddress'],[class*='address'],[id*='address'],[class*='store'],[id*='store'],[class*='location'],[id*='location'],[class*='contact'],[id*='contact']")
    .each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length >= 6) texts.push(t);
    });

  const bodyText = cleanText($("body").text());
  texts.push(...splitTextIntoAddressChunks(bodyText));

  const seen = new Set<string>();

  for (const t0 of texts) {
    const t = cleanText(t0).slice(0, 420);
    if (!t || seen.has(t)) continue;
    seen.add(t);

    const postalCode = inferPostal(t);
    const city = inferLocalityFromText(t);

    const hasNumber = /\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/.test(t) || /(χλμ|km)\s*\d+/i.test(t);
    if (!postalCode && !hasNumber) continue;

    const classified = classifyAddress(
      "PAGE_TEXT",
      sourceUrl,
      t,
      t,
      city,
      postalCode,
    );

    out.push({
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl,
      sourceType: "PAGE_TEXT",
      label: null,
      city,
      area: null,
      administrativeArea: null,
      addressLine: t,
      postalCode,
      latitude: null,
      longitude: null,
      sourceExcerpt: t,
      decision: classified.decision,
      reasons: classified.reasons,
      confidence: classified.confidence,
    });
  }

  return out;
}

function dedupeCandidates(rows: Candidate[]) {
  const map = new Map<string, Candidate>();

  for (const r of rows) {
    const k = [
      r.merchantId,
      norm(r.city || ""),
      norm((r.postalCode || "").replace(/\s/g, "")),
      norm(r.addressLine).replace(/[^\p{L}\p{N}]+/gu, ""),
    ].join("|");

    const prev = map.get(k);
    if (!prev || r.confidence > prev.confidence) map.set(k, r);
  }

  return [...map.values()];
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesLocationDiscovery/3.0; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) throw new Error(`Non-HTML: ${ct}`);

    return {
      url: res.url,
      html: await res.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function crawlMerchant(merchant: any): Promise<CrawlResult> {
  const website = merchant.websiteUrl;

  if (!website) {
    return {
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: null,
      decision: "NO_WEBSITE",
      reasons: ["No official website URL"],
      crawledUrls: [],
      candidates: [],
    };
  }

  let home: { url: string; html: string };

  try {
    home = await fetchPage(website);
  } catch (e: any) {
    return {
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: website,
      decision: "FETCH_FAILED",
      reasons: [String(e?.message || e)],
      crawledUrls: [],
      candidates: [],
    };
  }

  const discovered = new Map<string, number>();
  discovered.set(home.url, 1000);

  const $home = cheerio.load(home.html);

  $home("a[href]").each((_, el) => {
    const href = String($home(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    let abs: string;
    try {
      abs = new URL(href, home.url).toString();
    } catch {
      return;
    }

    if (!sameHost(abs, home.url)) return;

    const score = scorePageUrl(abs);
    if (score <= 0) return;

    const prev = discovered.get(abs) ?? -999;
    if (score > prev) discovered.set(abs, score);
  });

  const urls = [...discovered.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PAGES_PER_MERCHANT)
    .map(x => x[0]);

  const crawledUrls: string[] = [];
  const candidates: Candidate[] = [];

  for (const url of urls) {
    let page: { url: string; html: string };

    try {
      page = url === home.url ? home : await fetchPage(url);
    } catch {
      continue;
    }

    crawledUrls.push(page.url);

    const $ = cheerio.load(page.html);
    candidates.push(...extractJsonLdCandidates($, merchant, page.url));
    candidates.push(...extractMapCandidates($, merchant, page.url));
    candidates.push(...extractPageTextCandidates($, merchant, page.url));
  }

  const finalCandidates = dedupeCandidates(candidates)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 25);

  if (!finalCandidates.length) {
    return {
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: website,
      decision: "NO_ADDRESS_EVIDENCE",
      reasons: ["No usable address evidence found on official domain crawl"],
      crawledUrls,
      candidates: [],
    };
  }

  const hasSafe = finalCandidates.some(x => x.decision === "SAFE_CANDIDATE");
  const hasReview = finalCandidates.some(x => x.decision === "REVIEW");

  return {
    merchantId: merchant.id,
    merchant: merchant.name,
    merchantSlug: merchant.slug,
    websiteUrl: website,
    decision: hasSafe ? "SAFE_CANDIDATE" : hasReview ? "REVIEW" : "REJECT",
    reasons: [],
    crawledUrls,
    candidates: finalCandidates,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  // v3.1 schema-safe discovery:
  // GiftCard in this project has `status`, not `active` / `verificationStatus`.
  // Because this script is READ ONLY, use every merchant that has at least one
  // gift card and still has no active VERIFIED MerchantLocation. This can
  // over-include some merchants, but cannot write bad data.
  const merchants = await prisma.merchant.findMany({
    where: {
      giftCards: {
        some: {},
      },
      locations: {
        none: {
          active: true,
          verificationStatus: "VERIFIED",
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
    },
    orderBy: { name: "asc" },
  });

  console.log("=== MERCHANT LOCATION DISCOVERY v3.1 ===");
  console.log(`Merchants to inspect: ${merchants.length}`);
  console.log("MODE: DRY RUN / READ ONLY");

  const results = await mapLimit(
    merchants,
    CONCURRENCY,
    async (merchant, i) => {
      const r = await crawlMerchant(merchant);
      console.log(`[${i + 1}/${merchants.length}] ${merchant.name}: ${r.decision}`);
      return r;
    },
  );

  const allCandidates = results.flatMap(r => r.candidates);
  const safeCandidates = allCandidates.filter(x => x.decision === "SAFE_CANDIDATE");
  const reviewCandidates = allCandidates.filter(x => x.decision === "REVIEW");
  const rejectCandidates = allCandidates.filter(x => x.decision === "REJECT");

  const summary: Record<string, number> = {};
  for (const r of results) summary[r.decision] = (summary[r.decision] || 0) + 1;

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v3-dry-run.json",
  );

  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        merchantsInspected: merchants.length,
        merchantDecisionSummary: summary,
        candidateSummary: {
          SAFE_CANDIDATE: safeCandidates.length,
          REVIEW: reviewCandidates.length,
          REJECT: rejectCandidates.length,
          TOTAL: allCandidates.length,
        },
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log("=== MERCHANT SUMMARY ===");
  console.table(summary);

  console.log("=== CANDIDATE SUMMARY ===");
  console.table({
    SAFE_CANDIDATE: safeCandidates.length,
    REVIEW: reviewCandidates.length,
    REJECT: rejectCandidates.length,
    TOTAL: allCandidates.length,
  });

  console.log(`Report: reports\\regions\\merchant-location-discovery-v3-dry-run.json`);
  console.log("READ ONLY — database unchanged.");

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
