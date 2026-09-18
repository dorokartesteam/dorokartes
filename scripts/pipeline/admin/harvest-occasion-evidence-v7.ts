import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import robotsParser from "robots-parser";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = "occasion-evidence-harvest-v7" as const;
const REPORT_DIR = path.join(process.cwd(), "reports");
const REPORT_JSON = path.join(REPORT_DIR, "occasion-evidence-v7-source.json");
const REPORT_CSV = path.join(REPORT_DIR, "occasion-evidence-v7-source.csv");
const USER_AGENT = "DorokartesOccasionAudit/7.0 (+https://dorokartes.gr)";
const GLOBAL_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_DELAY_MS = 850;
const MAX_HTML_BYTES = 2_000_000;
const MAX_REQUESTS_PER_ORIGIN = 30;
const MAX_MAIN_TEXT_CHARS = 12_000;

type HeadingEvidence = {
  level: 1 | 2 | 3;
  text: string;
};

type ProductEvidence = {
  type: string;
  name: string | null;
  description: string | null;
};

type FetchEvidence = {
  requestedUrl: string;
  requestedUrlCanonical: string | null;
  finalUrl: string | null;
  finalUrlCanonical: string | null;
  sameRegistrableDomain: boolean | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  description: string | null;
  headings: HeadingEvidence[];
  navigation: string[];
  products: ProductEvidence[];
  mainText: string | null;
  contentHash: string | null;
  error: string | null;
};

type CardMaterial = {
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  giftCardSlug: string;
  officialUrl: string | null;
  officialUrlCanonical: string | null;
  merchantWebsiteUrl: string | null;
  verificationStatus: string;
  corporateAvailable: boolean;
  activeVariantTypes: string[];
  existingOccasions: Array<{
    occasionId: string;
    slug: string;
    relevance: number;
  }>;
  giftCardUpdatedAt: string;
  merchantUpdatedAt: string;
};

type SourceRow = CardMaterial & {
  officialEvidence: FetchEvidence;
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function unique(values: string[], limit: number) {
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, limit);
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function canonicalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|msclkid|srsltid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function registrableDomain(value: string) {
  const url = new URL(value);
  return (
    getDomain(url.hostname, { allowPrivateDomains: true }) ||
    url.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function sameRegistrableDomain(left?: string | null, right?: string | null) {
  if (!left || !right) return null;
  try {
    return registrableDomain(left) === registrableDomain(right);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RawResponse = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
};

class OriginSession {
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private requestCount = 0;
  private blocked = false;
  private robots: ReturnType<typeof robotsParser> | null = null;
  private robotsPromise: Promise<void> | null = null;
  private readonly cache = new Map<string, RawResponse | null>();

  constructor(private readonly origin: string) {}

  private async scheduled<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release = () => {};
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const remaining = REQUEST_DELAY_MS - (Date.now() - this.lastRequestAt);
    if (remaining > 0) await sleep(remaining);
    try {
      return await operation();
    } finally {
      this.lastRequestAt = Date.now();
      release();
    }
  }

  private async rawFetch(url: string, countRequest: boolean): Promise<RawResponse | null> {
    if (this.cache.has(url)) return this.cache.get(url) || null;
    if (this.blocked) return null;
    if (countRequest && this.requestCount >= MAX_REQUESTS_PER_ORIGIN) return null;

    return this.scheduled(async () => {
      if (countRequest) this.requestCount += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,text/plain;q=0.5",
            "accept-language": "el,en;q=0.8",
          },
        });
        if (response.status === 403 || response.status === 429) {
          this.blocked = true;
        }
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (declaredLength > MAX_HTML_BYTES) {
          this.cache.set(url, null);
          return null;
        }
        const raw: RawResponse = {
          requestedUrl: url,
          finalUrl: response.url || url,
          status: response.status,
          contentType: response.headers.get("content-type") || "",
          text: (await response.text()).slice(0, MAX_HTML_BYTES),
        };
        this.cache.set(url, raw);
        return raw;
      } catch {
        this.cache.set(url, null);
        return null;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  private async initRobots() {
    if (!this.robotsPromise) {
      this.robotsPromise = (async () => {
        const robotsUrl = `${this.origin}/robots.txt`;
        const response = await this.rawFetch(robotsUrl, false);
        this.robots = robotsParser(robotsUrl, response?.text || "");
      })();
    }
    await this.robotsPromise;
  }

  async fetch(url: string) {
    await this.initRobots();
    if (this.blocked) return { response: null, error: "DOMAIN_BLOCKED" } as const;
    if (this.robots?.isAllowed(url, USER_AGENT) === false) {
      return { response: null, error: "ROBOTS_DISALLOWED" } as const;
    }
    if (this.requestCount >= MAX_REQUESTS_PER_ORIGIN) {
      return { response: null, error: "ORIGIN_REQUEST_CAP_REACHED" } as const;
    }
    const response = await this.rawFetch(url, true);
    if (!response) {
      return { response: null, error: this.blocked ? "DOMAIN_BLOCKED" : "FETCH_FAILED" } as const;
    }
    return { response, error: null } as const;
  }
}

function collectJsonLdProducts($: cheerio.CheerioAPI) {
  const products: ProductEvidence[] = [];

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const rawType = record["@type"];
    const types = Array.isArray(rawType) ? rawType.map(String) : rawType ? [String(rawType)] : [];
    if (types.some((type) => /^(?:Product|GiftCard)$/i.test(type))) {
      products.push({
        type: types.join(" | ") || "Product",
        name: cleanText(typeof record.name === "string" ? record.name : null) || null,
        description:
          cleanText(typeof record.description === "string" ? record.description : null) || null,
      });
    }
    for (const child of Object.values(record)) visit(child);
  }

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      visit(JSON.parse(raw));
    } catch {
      // Invalid merchant JSON-LD remains non-actionable evidence.
    }
  });

  const deduplicated = new Map<string, ProductEvidence>();
  for (const product of products) {
    const key = stableHash(product);
    if (!deduplicated.has(key)) deduplicated.set(key, product);
  }
  return [...deduplicated.values()].slice(0, 20);
}

function parseHtml(response: RawResponse): Omit<FetchEvidence, "requestedUrl" | "requestedUrlCanonical"> {
  const finalUrlCanonical = canonicalUrl(response.finalUrl);
  const contentType = response.contentType || null;
  const base = {
    finalUrl: response.finalUrl || null,
    finalUrlCanonical,
    sameRegistrableDomain: sameRegistrableDomain(response.requestedUrl, response.finalUrl),
    status: response.status,
    contentType,
  };

  if (!contentType?.toLowerCase().includes("text/html")) {
    return {
      ...base,
      ok: false,
      title: null,
      description: null,
      headings: [],
      navigation: [],
      products: [],
      mainText: null,
      contentHash: null,
      error: "NON_HTML_RESPONSE",
    };
  }

  const $ = cheerio.load(response.text);
  const products = collectJsonLdProducts($);
  const title = cleanText($("title").first().text()) || null;
  const description =
    cleanText(
      $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content"),
    ) || null;
  const headings = $("h1,h2,h3")
    .map((_, element) => {
      if ($(element).closest("nav,header,footer,aside").length) return null;
      const tag = element.tagName.toLowerCase();
      const level = Number(tag.slice(1));
      const text = cleanText($(element).text());
      if (!text || (level !== 1 && level !== 2 && level !== 3)) return null;
      return { level: level as 1 | 2 | 3, text };
    })
    .get()
    .slice(0, 40);
  const navigation = unique(
    $("nav a,header a,footer a")
      .map((_, element) => $(element).text())
      .get(),
    100,
  );
  $("script,style,noscript,svg,nav,header,footer,aside").remove();
  const mainText = cleanText($("body").text()).slice(0, MAX_MAIN_TEXT_CHARS) || null;
  const contentHash = stableHash({
    finalUrl: response.finalUrl,
    title,
    description,
    headings,
    navigation,
    products,
    mainText,
  });
  const softNotFound = cleanText(`${title || ""} ${mainText || ""}`).toLowerCase().slice(0, 3_000);
  const soft404 =
    softNotFound.includes("page not found") ||
    softNotFound.includes("404 not found") ||
    softNotFound.includes("η σελιδα δεν βρεθηκε") ||
    softNotFound.includes("δεν βρεθηκε η σελιδα");
  const ok = response.status >= 200 && response.status < 300 && !soft404;

  return {
    ...base,
    ok,
    title,
    description,
    headings,
    navigation,
    products,
    mainText,
    contentHash,
    error: soft404 ? "SOFT_404" : ok ? null : `HTTP_${response.status}`,
  };
}

function emptyEvidence(requestedUrl: string, error: string): FetchEvidence {
  return {
    requestedUrl,
    requestedUrlCanonical: canonicalUrl(requestedUrl),
    finalUrl: null,
    finalUrlCanonical: null,
    sameRegistrableDomain: null,
    status: null,
    ok: false,
    contentType: null,
    title: null,
    description: null,
    headings: [],
    navigation: [],
    products: [],
    mainText: null,
    contentHash: null,
    error,
  };
}

async function loadCards() {
  return prisma.giftCard.findMany({
    where: { status: "ACTIVE", merchant: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      verificationStatus: true,
      corporateAvailable: true,
      updatedAt: true,
      merchant: {
        select: { id: true, name: true, websiteUrl: true, updatedAt: true },
      },
      variants: {
        where: { active: true },
        orderBy: { id: "asc" },
        select: { type: true },
      },
      occasions: {
        orderBy: { occasionId: "asc" },
        select: {
          occasionId: true,
          relevance: true,
          occasion: { select: { slug: true } },
        },
      },
    },
  });
}

type CatalogCard = Awaited<ReturnType<typeof loadCards>>[number];

function cardMaterial(card: CatalogCard): CardMaterial {
  return {
    giftCardId: card.id,
    merchantId: card.merchantId,
    merchantName: card.merchant.name,
    giftCardTitle: card.title,
    giftCardSlug: card.slug,
    officialUrl: card.officialUrl,
    officialUrlCanonical: canonicalUrl(card.officialUrl),
    merchantWebsiteUrl: card.merchant.websiteUrl,
    verificationStatus: card.verificationStatus,
    corporateAvailable: card.corporateAvailable,
    activeVariantTypes: card.variants.map((variant) => variant.type).sort(),
    existingOccasions: card.occasions.map((relation) => ({
      occasionId: relation.occasionId,
      slug: relation.occasion.slug,
      relevance: relation.relevance,
    })),
    giftCardUpdatedAt: card.updatedAt.toISOString(),
    merchantUpdatedAt: card.merchant.updatedAt.toISOString(),
  };
}

function writeCsv(rows: SourceRow[]) {
  const headers = [
    "giftCardId",
    "merchantName",
    "giftCardTitle",
    "verificationStatus",
    "officialUrl",
    "requestedUrlCanonical",
    "finalUrl",
    "sameRegistrableDomain",
    "status",
    "ok",
    "contentHash",
    "title",
    "description",
    "h1",
    "h2h3",
    "products",
    "error",
  ];
  const csvRows = rows.map((row) => ({
    giftCardId: row.giftCardId,
    merchantName: row.merchantName,
    giftCardTitle: row.giftCardTitle,
    verificationStatus: row.verificationStatus,
    officialUrl: row.officialUrl,
    requestedUrlCanonical: row.officialEvidence.requestedUrlCanonical,
    finalUrl: row.officialEvidence.finalUrl,
    sameRegistrableDomain: row.officialEvidence.sameRegistrableDomain,
    status: row.officialEvidence.status,
    ok: row.officialEvidence.ok,
    contentHash: row.officialEvidence.contentHash,
    title: row.officialEvidence.title,
    description: row.officialEvidence.description,
    h1: row.officialEvidence.headings
      .filter((heading) => heading.level === 1)
      .map((heading) => heading.text),
    h2h3: row.officialEvidence.headings
      .filter((heading) => heading.level !== 1)
      .map((heading) => heading.text),
    products: row.officialEvidence.products.map(
      (product) => `${product.type}: ${product.name || ""} ${product.description || ""}`.trim(),
    ),
    error: row.officialEvidence.error,
  }));
  const lines = [
    headers.join(","),
    ...csvRows.map((row) =>
      headers
        .map((header) => csvEscape((row as unknown as Record<string, unknown>)[header]))
        .join(","),
    ),
  ];
  fs.writeFileSync(REPORT_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("The v7 harvester is EVIDENCE_ONLY and has no apply mode.");
  }

  const cards = await loadCards();
  const materials = cards.map(cardMaterial);
  const urlsByCanonical = new Map<string, string>();
  for (const card of materials) {
    if (card.officialUrl && card.officialUrlCanonical && !urlsByCanonical.has(card.officialUrlCanonical)) {
      urlsByCanonical.set(card.officialUrlCanonical, card.officialUrl);
    }
  }

  const sessions = new Map<string, OriginSession>();
  function sessionFor(url: string) {
    const origin = new URL(url).origin;
    const existing = sessions.get(origin);
    if (existing) return existing;
    const created = new OriginSession(origin);
    sessions.set(origin, created);
    return created;
  }

  const limit = pLimit(GLOBAL_CONCURRENCY);
  let completed = 0;
  const fetched = await Promise.all(
    [...urlsByCanonical.entries()].map(([canonical, requestedUrl]) =>
      limit(async () => {
        const got = await sessionFor(requestedUrl).fetch(requestedUrl);
        let evidence: FetchEvidence;
        if (!got.response) {
          evidence = emptyEvidence(requestedUrl, got.error || "FETCH_FAILED");
        } else {
          evidence = {
            requestedUrl,
            requestedUrlCanonical: canonicalUrl(requestedUrl),
            ...parseHtml(got.response),
          };
        }
        completed += 1;
        if (completed % 50 === 0 || completed === urlsByCanonical.size) {
          console.log(`Fetched ${completed}/${urlsByCanonical.size}`);
        }
        return [canonical, evidence] as const;
      }),
    ),
  );
  const evidenceByCanonical = new Map(fetched);
  const rows: SourceRow[] = materials.map((card) => ({
    ...card,
    officialEvidence:
      (card.officialUrlCanonical && evidenceByCanonical.get(card.officialUrlCanonical)) ||
      emptyEvidence(card.officialUrl || "", "MISSING_OR_INVALID_OFFICIAL_URL"),
  }));

  const reportMaterial = {
    version: VERSION,
    mode: "EVIDENCE_ONLY" as const,
    scope: "ACTIVE_CATALOG" as const,
    catalogFingerprint: stableHash(materials),
    cardCount: rows.length,
    distinctOfficialUrlCount: urlsByCanonical.size,
    successfulUrlCount: fetched.filter(([, evidence]) => evidence.ok).length,
    failedUrlCount: fetched.filter(([, evidence]) => !evidence.ok).length,
    crossDomainRedirectCount: fetched.filter(
      ([, evidence]) => evidence.sameRegistrableDomain === false,
    ).length,
    rows,
  };
  const report = {
    ...reportMaterial,
    generatedAt: new Date().toISOString(),
    reportId: stableHash(reportMaterial),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(rows);
  const immutableBase = `occasion-evidence-v7-source-${report.reportId.slice(0, 16)}`;
  fs.copyFileSync(REPORT_JSON, path.join(REPORT_DIR, `${immutableBase}.json`));
  fs.copyFileSync(REPORT_CSV, path.join(REPORT_DIR, `${immutableBase}.csv`));

  console.log("Dorokartes Occasion Evidence Harvester v7 — EVIDENCE ONLY");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Active cards: ${report.cardCount}`);
  console.log(`Distinct official URLs: ${report.distinctOfficialUrlCount}`);
  console.log(`Successful: ${report.successfulUrlCount}`);
  console.log(`Failed: ${report.failedUrlCount}`);
  console.log(`Cross-domain redirects: ${report.crossDomainRedirectCount}`);
  console.log("No database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
