import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import pLimit from "p-limit";
import robotsParser from "robots-parser";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";

export type MerchantSeed = {
  merchantName: string;
  websiteUrl: string;
  category?: string;
};

export type DiscoveryCandidate = {
  merchantName: string;
  merchantWebsite: string;
  domain: string;
  category?: string;
  candidateUrl: string;
  discoveryMethod: "HOMEPAGE_LINK" | "SITEMAP";
  pageTitle?: string;
  score: number;
  reasons: string[];
};

const UA = "DorokartesDiscovery/3.0 (+https://dorokartes.gr)";
const REQUEST_TIMEOUT_MS = 12_000;
const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 1200;
const GLOBAL_CONCURRENCY = 3;
const MAX_REQUESTS_PER_DOMAIN = 12;
const MAX_SITEMAP_URLS = 4000;
const MAX_SITEMAPS = 6;

const limit = pLimit(GLOBAL_CONCURRENCY);

const POSITIVE_TERMS = [
  "gift card",
  "gift-card",
  "giftcard",
  "gift cards",
  "gift voucher",
  "gift-voucher",
  "e-gift",
  "egift",
  "δωροκάρτα",
  "δωροκαρτα",
  "δωροεπιταγή",
  "δωροεπιταγη",
  "dorokarta",
  "dwrokarta",
  "doroepitagi",
  "doroepitage",
];

const NEGATIVE_TERMS = [
  "/blog/",
  "/news/",
  "/events/",
  "/event/",
  "gift-guide",
  "gift-finder",
  "gift-wrapping",
  "packaging",
  "promotion",
  "contest",
  "christmas",
  "xmas",
  "/faq/",
  "terms",
  "conditions",
  "legal",
  "oroi",
  "redeem",
  "cardlist",
];

function norm(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(input: string) {
  const url = new URL(input);
  return (
    getDomain(url.hostname, { allowPrivateDomains: true }) ??
    url.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function hasPositive(text: string) {
  const n = norm(text);
  return POSITIVE_TERMS.some((term) => n.includes(norm(term)));
}

function hasNegativeUrl(url: string) {
  const n = norm(url);
  return NEGATIVE_TERMS.some((term) => n.includes(norm(term)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter() {
  return MIN_DELAY_MS +
    Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

function cleanUrl(input: string) {
  const u = new URL(input);
  u.hash = "";
  return u.toString();
}

function fingerprint(domain: string, url: string) {
  return createHash("sha256")
    .update(`official-site-discovery-v3|${domain}|${url}`)
    .digest("hex");
}

class DomainSession {
  requests = 0;
  blocked = false;
  robots: ReturnType<typeof robotsParser> | null = null;
  cache = new Map<string, {
    status: number;
    url: string;
    text: string;
    contentType: string;
  } | null>();

  constructor(public websiteUrl: string) {}

  async rawFetch(url: string, count = true) {
    if (this.blocked) return null;
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    if (count && this.requests >= MAX_REQUESTS_PER_DOMAIN) return null;

    if (count) {
      this.requests++;
      await sleep(jitter());
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": UA,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      if (res.status === 403 || res.status === 429) {
        this.blocked = true;
        this.cache.set(url, null);
        return null;
      }

      if (!res.ok) {
        this.cache.set(url, null);
        return null;
      }

      const result = {
        status: res.status,
        url: res.url,
        text: await res.text(),
        contentType: res.headers.get("content-type") ?? "",
      };

      this.cache.set(url, result);
      return result;
    } catch {
      this.cache.set(url, null);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async initRobots() {
    const origin = new URL(this.websiteUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const result = await this.rawFetch(robotsUrl, false);
    this.robots = robotsParser(robotsUrl, result?.text ?? "");
  }

  allowed(url: string) {
    if (!this.robots) return true;
    return this.robots.isAllowed(url, UA) !== false;
  }

  async fetch(url: string) {
    if (!this.allowed(url)) return null;
    return this.rawFetch(url, true);
  }
}

function extractHomepageCandidates(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const out = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const label = $(el).text().replace(/\s+/g, " ").trim();

    if (!href) return;

    try {
      const url = cleanUrl(new URL(href, baseUrl).toString());
      if (domainOf(url) !== domainOf(baseUrl)) return;
      if (!hasPositive(`${url} ${label}`)) return;
      if (hasNegativeUrl(url)) return;
      out.add(url);
    } catch {}
  });

  return [...out].slice(0, 10);
}

function extractXmlLocations(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const out: string[] = [];

  function walk(value: unknown, key = "") {
    if (value == null) return;

    if (Array.isArray(value)) {
      for (const v of value) walk(v, key);
      return;
    }

    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, k);
      }
      return;
    }

    if (key === "loc" && typeof value === "string") {
      out.push(value);
    }
  }

  walk(parsed);
  return out;
}

async function sitemapCandidates(
  session: DomainSession,
  merchant: MerchantSeed,
) {
  const origin = new URL(merchant.websiteUrl).origin;
  const sitemapQueue = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];
  const seenSitemaps = new Set<string>();
  const candidateUrls = new Set<string>();

  while (
    sitemapQueue.length &&
    seenSitemaps.size < MAX_SITEMAPS &&
    candidateUrls.size < 20
  ) {
    const sitemapUrl = sitemapQueue.shift()!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const got = await session.fetch(sitemapUrl);
    if (!got) continue;

    let locs: string[] = [];
    try {
      locs = extractXmlLocations(got.text).slice(0, MAX_SITEMAP_URLS);
    } catch {
      continue;
    }

    for (const loc of locs) {
      if (!loc.startsWith("http")) continue;

      let sameDomain = false;
      try {
        sameDomain = domainOf(loc) === domainOf(merchant.websiteUrl);
      } catch {
        continue;
      }
      if (!sameDomain) continue;

      if (/sitemap.*\.xml($|\?)/i.test(loc)) {
        if (sitemapQueue.length + seenSitemaps.size < MAX_SITEMAPS) {
          sitemapQueue.push(loc);
        }
        continue;
      }

      if (hasPositive(loc) && !hasNegativeUrl(loc)) {
        candidateUrls.add(cleanUrl(loc));
      }

      if (candidateUrls.size >= 20) break;
    }
  }

  return [...candidateUrls];
}

async function validateCandidate(
  session: DomainSession,
  merchant: MerchantSeed,
  url: string,
  method: DiscoveryCandidate["discoveryMethod"],
): Promise<DiscoveryCandidate | null> {
  if (hasNegativeUrl(url)) return null;

  const got = await session.fetch(url);
  if (!got) return null;

  const finalUrl = cleanUrl(got.url);

  try {
    if (domainOf(finalUrl) !== domainOf(merchant.websiteUrl)) return null;
  } catch {
    return null;
  }

  if (hasNegativeUrl(finalUrl)) return null;

  let title = "";
  let body = "";

  if (got.contentType.includes("html")) {
    const $ = cheerio.load(got.text);
    $("script,style,noscript,svg").remove();
    title = $("title").first().text().replace(/\s+/g, " ").trim();
    body = $("body").text().replace(/\s+/g, " ").slice(0, 30_000);
  } else {
    body = got.text.slice(0, 30_000);
  }

  const pageEvidence = `${finalUrl} ${title} ${body}`;

  // A URL token alone is not enough. The fetched page must itself contain
  // gift-card evidence.
  if (!hasPositive(pageEvidence)) return null;

  const softNotFound = norm(`${title} ${body.slice(0, 3000)}`);
  if (
    softNotFound.includes("page not found") ||
    softNotFound.includes("not found") ||
    softNotFound.includes("δεν βρεθηκε")
  ) {
    return null;
  }

  let score = 45;
  const reasons = ["validated gift-card evidence on official page"];

  if (method === "HOMEPAGE_LINK") {
    score += 20;
    reasons.push("linked from official homepage");
  } else {
    score += 10;
    reasons.push("listed in official sitemap");
  }

  if (
    /gift-card|giftcard|egift|dorokarta|dwrokarta|doroepitag/i.test(finalUrl)
  ) {
    score += 15;
    reasons.push("strong gift-card URL token");
  }

  if (/\/(el|el-gr|grc)(\/|$)/i.test(new URL(finalUrl).pathname)) {
    score += 5;
    reasons.push("Greek locale");
  }

  return {
    merchantName: merchant.merchantName,
    merchantWebsite: merchant.websiteUrl,
    domain: domainOf(merchant.websiteUrl),
    category: merchant.category,
    candidateUrl: finalUrl,
    discoveryMethod: method,
    pageTitle: title || undefined,
    score,
    reasons,
  };
}

export async function loadMerchantUniverse(
  path = "data/discovery/mass/merchant-universe.csv",
): Promise<MerchantSeed[]> {
  const raw = (await readFile(resolve(process.cwd(), path), "utf8"))
    .replace(/^\uFEFF/, "");

  const lines = raw.split(/\r?\n/).filter((x) => x.trim());
  if (lines.length < 2) return [];

  const dedup = new Map<string, MerchantSeed>();

  for (const line of lines.slice(1)) {
    // Current seed file is intentionally simple CSV:
    // merchant_name,website_url,category
    const [merchantNameRaw, websiteUrlRaw, categoryRaw] = line.split(",");
    const merchantName = merchantNameRaw?.trim();
    const websiteUrl = websiteUrlRaw?.trim();
    const category = categoryRaw?.trim() || undefined;

    if (!merchantName || !websiteUrl) continue;

    try {
      const domain = domainOf(websiteUrl);
      if (!dedup.has(domain)) {
        dedup.set(domain, { merchantName, websiteUrl, category });
      }
    } catch {}
  }

  return [...dedup.values()];
}

export async function knownDomains(prisma: PrismaClient) {
  const [merchants, discovery] = await Promise.all([
    prisma.merchant.findMany({
      where: { websiteUrl: { not: null } },
      select: { websiteUrl: true },
    }),
    prisma.discoveryItem.findMany({
      where: {
        status: {
          in: [
            DiscoveryStatus.VERIFIED,
            DiscoveryStatus.QUEUED,
            DiscoveryStatus.DISCOVERED,
          ],
        },
      },
      select: { sourceUrl: true },
    }),
  ]);

  const out = new Set<string>();

  for (const m of merchants) {
    if (!m.websiteUrl) continue;
    try { out.add(domainOf(m.websiteUrl)); } catch {}
  }

  for (const d of discovery) {
    try { out.add(domainOf(d.sourceUrl)); } catch {}
  }

  return out;
}

export async function discoverMerchant(
  merchant: MerchantSeed,
): Promise<{
  merchant: MerchantSeed;
  domain: string;
  blocked: boolean;
  requests: number;
  candidates: DiscoveryCandidate[];
}> {
  return limit(async () => {
    const domain = domainOf(merchant.websiteUrl);
    const session = new DomainSession(merchant.websiteUrl);
    await session.initRobots();

    const raw = new Map<
      string,
      DiscoveryCandidate["discoveryMethod"]
    >();

    const homepage = await session.fetch(merchant.websiteUrl);
    if (homepage?.contentType.includes("html")) {
      for (const url of extractHomepageCandidates(homepage.text, homepage.url)) {
        raw.set(url, "HOMEPAGE_LINK");
      }
    }

    if (!session.blocked) {
      for (const url of await sitemapCandidates(session, merchant)) {
        if (!raw.has(url)) raw.set(url, "SITEMAP");
      }
    }

    const candidates: DiscoveryCandidate[] = [];

    for (const [url, method] of [...raw.entries()].slice(0, 12)) {
      if (session.blocked) break;
      const candidate = await validateCandidate(
        session,
        merchant,
        url,
        method,
      );
      if (candidate) candidates.push(candidate);
    }

    const unique = new Map<string, DiscoveryCandidate>();
    for (const c of candidates) {
      const existing = unique.get(c.candidateUrl);
      if (!existing || c.score > existing.score) {
        unique.set(c.candidateUrl, c);
      }
    }

    return {
      merchant,
      domain,
      blocked: session.blocked,
      requests: session.requests,
      candidates: [...unique.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    };
  });
}

export async function storeCandidates(
  prisma: PrismaClient,
  candidates: DiscoveryCandidate[],
) {
  let created = 0;
  let existing = 0;

  for (const candidate of candidates) {
    const fp = fingerprint(candidate.domain, candidate.candidateUrl);

    const duplicate = await prisma.discoveryItem.findFirst({
      where: {
        OR: [
          { fingerprint: fp },
          { sourceUrl: candidate.candidateUrl },
        ],
      },
      select: { id: true },
    });

    if (duplicate) {
      existing++;
      continue;
    }

    await prisma.discoveryItem.create({
      data: {
        sourceType: SourceType.OFFICIAL,
        sourceName: "Official Site Discovery v3",
        sourceUrl: candidate.candidateUrl,
        title: candidate.pageTitle,
        merchantName: candidate.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: candidate.merchantWebsite,
        fingerprint: fp,
        notes:
          `Discovery method=${candidate.discoveryMethod}; ` +
          `score=${candidate.score}; category=${candidate.category ?? "-"}; ` +
          `reasons=${candidate.reasons.join(", ")}`,
      },
    });

    created++;
  }

  return { created, existing };
}
