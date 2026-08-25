import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { XMLParser } from "fast-xml-parser";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SeedMerchant, FoundCandidate } from "./types";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const limit = pLimit(5);

const UA =
  "Mozilla/5.0 (compatible; DorokartesDiscovery/2.0; +https://dorokartes.gr)";

const GOOD = [
  "gift-card","giftcard","gift-cards","e-gift","egift","gift-voucher",
  "gift-vouchers","dorokarta","dwrokarta","doroepitagi","doroepitage",
  "δωροκαρτα","δωροκάρτα","δωροεπιταγη","δωροεπιταγή","sky-gift"
];

const BAD = [
  "/blog/","/news/","/events/","/event/","gift-guide","gift-finder",
  "gift-wrapping","packaging","engraving","/collection/","promotion",
  "contest","holiday-gift","spring-gift","christmas","xmas","/product/dora/"
];

const KNOWN_PATHS = [
  "/gift-card","/gift-cards","/giftcard","/e-gift-card","/egift",
  "/gift-voucher","/gift-vouchers","/dorokarta","/dwrokarta",
  "/doroepitagi","/doroepitage"
];

function norm(s: string) {
  return s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/\p{Diacritic}/gu,"");
}

function domainOf(url: string) {
  const u = new URL(url);
  return getDomain(u.hostname, { allowPrivateDomains: true })
    ?? u.hostname.replace(/^www\./,"");
}

function scoreUrl(url: string, title = "") {
  const text = norm(`${url} ${title}`);
  let score = 0;
  const reasons: string[] = [];

  for (const token of GOOD) {
    if (text.includes(norm(token))) {
      score += 20;
      reasons.push(`gift-token:${token}`);
      break;
    }
  }

  for (const token of BAD) {
    if (text.includes(norm(token))) {
      score -= 60;
      reasons.push(`negative:${token}`);
      break;
    }
  }

  if (/\/(el|el-gr|grc)\//i.test(url)) {
    score += 5;
    reasons.push("greek-locale");
  }

  if (/terms|conditions|oroi|legal/i.test(text)) {
    score -= 25;
    reasons.push("terms-like");
  }

  return { score, reasons };
}

async function fetchText(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return { text: await res.text(), finalUrl: res.url, contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function sitemapUrls(base: string) {
  const root = new URL(base).origin;
  const guesses = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`];
  const out = new Set<string>();
  const parser = new XMLParser({ ignoreAttributes: false });

  for (const guess of guesses) {
    const got = await fetchText(guess);
    if (!got) continue;

    try {
      const parsed = parser.parse(got.text);

      const locs: string[] = [];
      const addLoc = (v: any) => {
        if (!v) return;
        if (Array.isArray(v)) v.forEach(addLoc);
        else if (typeof v === "string") locs.push(v);
        else if (typeof v === "object") {
          for (const [k,val] of Object.entries(v)) {
            if (k === "loc") addLoc(val);
            else addLoc(val);
          }
        }
      };
      addLoc(parsed);

      for (const loc of locs.slice(0, 5000)) {
        if (GOOD.some(t => norm(loc).includes(norm(t)))) out.add(loc);
      }
    } catch {}
  }
  return [...out];
}

async function homepageLinks(base: string) {
  const got = await fetchText(base);
  if (!got || !got.contentType.includes("html")) return [];
  const $ = cheerio.load(got.text);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    if (!href) return;
    try {
      const abs = new URL(href, got.finalUrl).toString();
      const text = norm(`${abs} ${title}`);
      if (GOOD.some(t => text.includes(norm(t)))) out.add(abs);
    } catch {}
  });
  return [...out];
}

async function probeKnownPaths(base: string) {
  const origin = new URL(base).origin;
  const found: string[] = [];
  for (const p of KNOWN_PATHS) {
    const url = `${origin}${p}`;
    const got = await fetchText(url, 7000);
    if (!got) continue;
    const final = got.finalUrl;
    const finalPath = new URL(final).pathname;
    // Reject aliases that simply end at homepage.
    if (finalPath === "/" || finalPath === "") continue;
    found.push(final);
  }
  return found;
}

async function loadSeeds(): Promise<SeedMerchant[]> {
  const path = resolve(process.cwd(), "data/discovery/mass/merchant-universe.csv");
  const raw = await readFile(path, "utf-8");
  const lines = raw.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map(line => {
    // CSV is simple and controlled: no commas in values.
    const [merchantName, websiteUrl, category] = line.split(",");
    return { merchantName, websiteUrl, category };
  });
}

async function alreadyProductionDomains() {
  const merchants = await prisma.merchant.findMany({
    where: { websiteUrl: { not: null } },
    select: { websiteUrl: true },
  });
  return new Set(
    merchants
      .map(m => m.websiteUrl)
      .filter((x): x is string => Boolean(x))
      .map(domainOf)
  );
}

async function runOne(seed: SeedMerchant, productionDomains: Set<string>) {
  const domain = domainOf(seed.websiteUrl);
  if (productionDomains.has(domain)) {
    return { seed, skipped: "already-production", candidates: [] as FoundCandidate[] };
  }

  const candidates = new Map<string, FoundCandidate>();

  const add = (url: string, method: FoundCandidate["discoveryMethod"]) => {
    try {
      if (domainOf(url) !== domain) return;
    } catch { return; }
    const scored = scoreUrl(url);
    if (scored.score < 15) return;
    const normalized = url.replace(/#.*$/,"").replace(/\/$/,"");
    const prev = candidates.get(normalized);
    const item: FoundCandidate = {
      merchantName: seed.merchantName,
      merchantWebsite: seed.websiteUrl,
      domain,
      category: seed.category,
      candidateUrl: normalized,
      discoveryMethod: method,
      score: scored.score,
      reasons: scored.reasons,
    };
    if (!prev || item.score > prev.score) candidates.set(normalized, item);
  };

  const [sitemap, links, known] = await Promise.all([
    sitemapUrls(seed.websiteUrl),
    homepageLinks(seed.websiteUrl),
    probeKnownPaths(seed.websiteUrl),
  ]);

  sitemap.forEach(u => add(u, "SITEMAP"));
  links.forEach(u => add(u, "HOMEPAGE_LINK"));
  known.forEach(u => add(u, "KNOWN_PATH"));

  return { seed, skipped: null, candidates: [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,12) };
}

async function main() {
  const seeds = await loadSeeds();
  const prod = await alreadyProductionDomains();

  console.log(`Mass Discovery v2`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Seed merchants: ${seeds.length}`);
  console.log(`Existing production domains: ${prod.size}`);
  console.log("");

  const results = await Promise.all(
    seeds.map(seed => limit(() => runOne(seed, prod)))
  );

  const allCandidates = results.flatMap(r => r.candidates);
  const domainsWithCandidates = new Set(allCandidates.map(x => x.domain));

  for (const result of results) {
    if (result.skipped) continue;
    if (!result.candidates.length) continue;
    console.log(`=== ${result.seed.merchantName} ===`);
    for (const c of result.candidates.slice(0,5)) {
      console.log(`  ${c.score} [${c.discoveryMethod}] ${c.candidateUrl}`);
    }
  }

  const reportPath = resolve(process.cwd(), "data/discovery/mass/mass-discovery-v2-report.json");
  await writeFile(reportPath, JSON.stringify(results, null, 2), "utf-8");

  let saved = 0;

  if (APPLY) {
    for (const c of allCandidates) {
      const existing = await prisma.discoveryItem.findFirst({
        where: {
          OR: [
            { sourceUrl: c.candidateUrl },
            {
              AND: [
                { merchantName: c.merchantName },
                { possibleOfficialUrl: c.merchantWebsite },
              ],
            },
          ],
        },
      });

      if (existing) continue;

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: "Mass Discovery v2",
          sourceUrl: c.candidateUrl,
          title: `${c.merchantName} gift-card candidate`,
          merchantName: c.merchantName,
          possibleOfficialUrl: c.merchantWebsite,
          fingerprint: `${c.domain}|${c.candidateUrl}`.toLowerCase(),
          status: DiscoveryStatus.DISCOVERED,
          notes: `Mass Discovery v2 via ${c.discoveryMethod}; score=${c.score}; ${c.reasons.join(", ")}`,
        },
      });
      saved++;
    }
  }

  console.log("");
  console.log("====================================");
  console.log(`Seed merchants: ${seeds.length}`);
  console.log(`Skipped already-production: ${results.filter(r => r.skipped).length}`);
  console.log(`Domains with candidate URLs: ${domainsWithCandidates.size}`);
  console.log(`Candidate URLs found: ${allCandidates.length}`);
  console.log(`Rows saved: ${saved}`);
  console.log(`Report: ${reportPath}`);
  if (!APPLY) console.log("No database rows were changed.");

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
