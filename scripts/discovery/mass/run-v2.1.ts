import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const GLOBAL_CONCURRENCY = 3;
const MAX_REQUESTS_PER_DOMAIN = 14;
const MIN_DELAY_MS = 850;
const MAX_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 10000;

const limit = pLimit(GLOBAL_CONCURRENCY);
const UA = "DorokartesDiscovery/2.1 (+https://dorokartes.gr)";

type SeedMerchant = {
  merchantName: string;
  websiteUrl: string;
  category?: string;
};

type Candidate = {
  merchantName: string;
  merchantWebsite: string;
  domain: string;
  category?: string;
  candidateUrl: string;
  discoveryMethod: "SITEMAP" | "HOMEPAGE_LINK" | "KNOWN_PATH";
  score: number;
  reasons: string[];
  pageTitle?: string;
};

const GIFT_TERMS = [
  "gift card","gift-card","giftcard","gift cards","gift voucher","gift-voucher",
  "e-gift","egift","δωροκάρτα","δωροκαρτα","δωροεπιταγή","δωροεπιταγη",
  "dorokarta","dwrokarta","doroepitagi","doroepitage"
];

const BAD_URL_TERMS = [
  "/blog/","/news/","/events/","/event/","gift-guide","gift-finder",
  "gift-wrapping","packaging","engraving","/collection/","promotion",
  "contest","holiday-gift","spring-gift","christmas","xmas","/product/dora/",
  "/faq/","faq/","terms","conditions","oroi","legalframework","redeem",
  "cardlist","account/"
];

const KNOWN_PATHS = [
  "/gift-card",
  "/gift-cards",
  "/giftcard",
  "/e-gift-card",
  "/gift-voucher",
  "/dorokarta",
  "/dwrokarta",
  "/doroepitagi",
];

function norm(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(input: string) {
  const url = new URL(input);
  return (
    getDomain(url.hostname, { allowPrivateDomains: true }) ??
    url.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

function hasGiftEvidence(text: string) {
  const n = norm(text);
  return GIFT_TERMS.some((term) => n.includes(norm(term)));
}

function isBadCandidateUrl(url: string) {
  const n = norm(url);
  return BAD_URL_TERMS.some((term) => n.includes(norm(term)));
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

  constructor(public baseUrl: string) {}

  async initRobots() {
    const origin = new URL(this.baseUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;

    try {
      const result = await this.rawFetch(robotsUrl, false);
      this.robots = robotsParser(robotsUrl, result?.text ?? "");
    } catch {
      this.robots = robotsParser(robotsUrl, "");
    }
  }

  allowed(url: string) {
    if (!this.robots) return true;
    return this.robots.isAllowed(url, UA) !== false;
  }

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

    const execute = async () => {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      if (res.status === 403 || res.status === 429) {
        this.blocked = true;
        return null;
      }

      if (res.status >= 500 && res.status <= 599) {
        await sleep(1800);
        const retry = await fetch(url, {
          headers: {
            "user-agent": UA,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: controller.signal,
        });

        if (!retry.ok) return null;
        return {
          status: retry.status,
          url: retry.url,
          text: await retry.text(),
          contentType: retry.headers.get("content-type") ?? "",
        };
      }

      if (!res.ok) return null;

      return {
        status: res.status,
        url: res.url,
        text: await res.text(),
        contentType: res.headers.get("content-type") ?? "",
      };
    };

    try {
      const result = await execute();
      this.cache.set(url, result);
      return result;
    } catch {
      this.cache.set(url, null);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetch(url: string) {
    if (!this.allowed(url)) return null;
    return this.rawFetch(url, true);
  }
}

function scoreCandidate(url: string, title = "", method = "") {
  let score = 0;
  const reasons: string[] = [];
  const text = `${url} ${title}`;

  if (hasGiftEvidence(text)) {
    score += 35;
    reasons.push("gift-card evidence");
  }

  if (/\/(el|el-gr|grc)\//i.test(url)) {
    score += 8;
    reasons.push("Greek locale");
  }

  if (/gift-card|giftcard|dorokarta|dwrokarta|doroepit/i.test(url)) {
    score += 15;
    reasons.push("strong URL token");
  }

  if (method === "HOMEPAGE_LINK") {
    score += 10;
    reasons.push("linked from homepage");
  }

  if (method === "SITEMAP") {
    score += 5;
    reasons.push("found in sitemap");
  }

  if (isBadCandidateUrl(url)) {
    score -= 80;
    reasons.push("negative URL role");
  }

  return { score, reasons };
}

async function validateCandidate(
  session: DomainSession,
  merchant: SeedMerchant,
  url: string,
  method: Candidate["discoveryMethod"],
): Promise<Candidate | null> {
  if (isBadCandidateUrl(url)) return null;

  const got = await session.fetch(url);
  if (!got) return null;

  const finalUrl = got.url;
  const final = new URL(finalUrl);

  if (domainOf(finalUrl) !== domainOf(merchant.websiteUrl)) return null;
  if (final.pathname === "/" || final.pathname === "") return null;
  if (/notfound|404|page-not-found/i.test(finalUrl)) return null;

  let title = "";
  let bodyText = "";

  if (got.contentType.includes("html")) {
    const $ = cheerio.load(got.text);
    title = $("title").first().text().trim();
    bodyText = $("body").text().replace(/\s+/g, " ").slice(0, 25000);
  } else {
    bodyText = got.text.slice(0, 25000);
  }

  const evidenceText = `${finalUrl} ${title} ${bodyText}`;

  // Known-path guesses are accepted only if the fetched page itself proves gift-card relevance.
  if (!hasGiftEvidence(evidenceText)) return null;

  if (/not found|page not found|δεν βρεθηκε|δεν βρέθηκε/i.test(norm(`${title} ${bodyText.slice(0, 2500)}`))) {
    return null;
  }

  const scored = scoreCandidate(finalUrl, title, method);
  if (scored.score < 35) return null;

  return {
    merchantName: merchant.merchantName,
    merchantWebsite: merchant.websiteUrl,
    domain: domainOf(merchant.websiteUrl),
    category: merchant.category,
    candidateUrl: finalUrl.replace(/#.*$/, "").replace(/\/$/, ""),
    discoveryMethod: method,
    score: scored.score,
    reasons: scored.reasons,
    pageTitle: title || undefined,
  };
}

async function homepageLinks(session: DomainSession, merchant: SeedMerchant) {
  const got = await session.fetch(merchant.websiteUrl);
  if (!got || !got.contentType.includes("html")) return [];

  const $ = cheerio.load(got.text);
  const out = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const label = $(el).text().trim();
    if (!href) return;

    try {
      const abs = new URL(href, got.url).toString();
      if (domainOf(abs) !== domainOf(merchant.websiteUrl)) return;
      if (hasGiftEvidence(`${abs} ${label}`) && !isBadCandidateUrl(abs)) out.add(abs);
    } catch {}
  });

  return [...out].slice(0, 8);
}

async function sitemapCandidates(session: DomainSession, merchant: SeedMerchant) {
  const origin = new URL(merchant.websiteUrl).origin;
  const guesses = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const parser = new XMLParser({ ignoreAttributes: false });
  const out = new Set<string>();

  for (const sitemapUrl of guesses) {
    const got = await session.fetch(sitemapUrl);
    if (!got) continue;

    try {
      const parsed = parser.parse(got.text);
      const locs: string[] = [];

      function collect(value: any, key = "") {
        if (value == null) return;
        if (Array.isArray(value)) {
          value.forEach((v) => collect(v, key));
          return;
        }
        if (typeof value === "object") {
          for (const [k, v] of Object.entries(value)) collect(v, k);
          return;
        }
        if (key === "loc" && typeof value === "string") locs.push(value);
      }

      collect(parsed);

      for (const loc of locs.slice(0, 5000)) {
        if (!loc.startsWith("http")) continue;
        try {
          if (domainOf(loc) !== domainOf(merchant.websiteUrl)) continue;
        } catch {
          continue;
        }
        if (hasGiftEvidence(loc) && !isBadCandidateUrl(loc)) out.add(loc);
      }
    } catch {}
  }

  return [...out].slice(0, 8);
}

async function loadSeeds(): Promise<SeedMerchant[]> {
  const path = resolve(process.cwd(), "data/discovery/mass/merchant-universe.csv");
  const raw = (await readFile(path, "utf-8")).replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  return lines.slice(1).map((line) => {
    const [merchantName, websiteUrl, category] = line.split(",");
    return { merchantName, websiteUrl, category };
  });
}

async function knownDomainsToSkip() {
  const production = await prisma.merchant.findMany({
    where: { websiteUrl: { not: null } },
    select: { websiteUrl: true },
  });

  const activeDiscovery = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [DiscoveryStatus.VERIFIED, DiscoveryStatus.QUEUED],
      },
    },
    select: { sourceUrl: true },
  });

  const domains = new Set<string>();

  for (const row of production) {
    if (!row.websiteUrl) continue;
    try { domains.add(domainOf(row.websiteUrl)); } catch {}
  }

  for (const row of activeDiscovery) {
    try { domains.add(domainOf(row.sourceUrl)); } catch {}
  }

  return domains;
}

async function runMerchant(merchant: SeedMerchant, skipDomains: Set<string>) {
  const domain = domainOf(merchant.websiteUrl);

  if (skipDomains.has(domain)) {
    console.log(`[SKIP] ${merchant.merchantName} (${domain}) already known`);
    return { merchant, domain, skipped: true, blocked: false, requests: 0, candidates: [] as Candidate[] };
  }

  const session = new DomainSession(merchant.websiteUrl);
  await session.initRobots();

  const raw = new Map<string, Candidate["discoveryMethod"]>();

  const links = await homepageLinks(session, merchant);
  for (const url of links) raw.set(url, "HOMEPAGE_LINK");

  if (!session.blocked) {
    const site = await sitemapCandidates(session, merchant);
    for (const url of site) if (!raw.has(url)) raw.set(url, "SITEMAP");
  }

  if (!session.blocked) {
    const origin = new URL(merchant.websiteUrl).origin;
    for (const path of KNOWN_PATHS) {
      if (session.requests >= MAX_REQUESTS_PER_DOMAIN || session.blocked) break;
      const guess = `${origin}${path}`;
      if (!raw.has(guess)) raw.set(guess, "KNOWN_PATH");
    }
  }

  const candidates: Candidate[] = [];

  for (const [url, method] of raw) {
    if (session.requests >= MAX_REQUESTS_PER_DOMAIN || session.blocked) break;
    const validated = await validateCandidate(session, merchant, url, method);
    if (validated) candidates.push(validated);
  }

  const deduped = new Map<string, Candidate>();

  for (const c of candidates) {
    const key = c.candidateUrl.replace(/\/$/, "");
    const prev = deduped.get(key);
    if (!prev || c.score > prev.score) deduped.set(key, c);
  }

  const finalCandidates = [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  console.log(
    `[DONE] ${merchant.merchantName} requests=${session.requests} blocked=${session.blocked} candidates=${finalCandidates.length}`,
  );

  for (const c of finalCandidates) {
    console.log(`  ${c.score} [${c.discoveryMethod}] ${c.candidateUrl}`);
  }

  return {
    merchant,
    domain,
    skipped: false,
    blocked: session.blocked,
    requests: session.requests,
    candidates: finalCandidates,
  };
}

async function main() {
  const seeds = await loadSeeds();
  const skipDomains = await knownDomainsToSkip();

  console.log("Mass Discovery v2.1");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Seed merchants: ${seeds.length}`);
  console.log(`Known domains skipped: ${skipDomains.size}`);
  console.log(`Global concurrency: ${GLOBAL_CONCURRENCY}`);
  console.log(`Max requests/domain: ${MAX_REQUESTS_PER_DOMAIN}`);
  console.log(`Delay/request: ${MIN_DELAY_MS}-${MAX_DELAY_MS}ms`);
  console.log("");

  const results = await Promise.all(
    seeds.map((merchant) => limit(() => runMerchant(merchant, skipDomains))),
  );

  const candidates = results.flatMap((r) => r.candidates);
  const domainsWithCandidates = new Set(candidates.map((c) => c.domain));

  const reportPath = resolve(
    process.cwd(),
    "data/discovery/mass/mass-discovery-v2.1-report.json",
  );

  await writeFile(reportPath, JSON.stringify(results, null, 2), "utf-8");

  let saved = 0;

  if (APPLY) {
    for (const c of candidates) {
      const exists = await prisma.discoveryItem.findFirst({
        where: { sourceUrl: c.candidateUrl },
      });

      if (exists) continue;

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: "Mass Discovery v2.1",
          sourceUrl: c.candidateUrl,
          title: c.pageTitle ?? `${c.merchantName} gift-card candidate`,
          merchantName: c.merchantName,
          possibleOfficialUrl: c.merchantWebsite,
          fingerprint: `${c.domain}|${c.candidateUrl}`.toLowerCase(),
          status: DiscoveryStatus.DISCOVERED,
          notes: `Mass Discovery v2.1 via ${c.discoveryMethod}; score=${c.score}; ${c.reasons.join(", ")}`,
        },
      });

      saved++;
    }
  }

  console.log("");
  console.log("====================================");
  console.log(`Seed merchants: ${seeds.length}`);
  console.log(`Skipped known domains: ${results.filter((r) => r.skipped).length}`);
  console.log(`Blocked domains: ${results.filter((r) => r.blocked).length}`);
  console.log(`Domains with validated candidates: ${domainsWithCandidates.size}`);
  console.log(`Validated candidate URLs: ${candidates.length}`);
  console.log(`Rows saved: ${saved}`);
  console.log(`Report: ${reportPath}`);
  if (!APPLY) console.log("No database rows were changed.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});