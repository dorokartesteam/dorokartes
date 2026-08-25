import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { DISCOVERY_CONFIG } from "./config";
import { fetchText, isAllowedByRobots, sleep } from "./http";
import { findGiftCardUrlsFromSitemaps } from "./sitemap";
import { scoreCandidate } from "./scoring";
import type { Candidate, ScanResult } from "./types";

function canonicalOrigin(domainOrUrl: string) {
  const url = domainOrUrl.startsWith("http")
    ? new URL(domainOrUrl)
    : new URL(`https://${domainOrUrl}`);

  return url.origin;
}

function sameHost(a: string, b: string) {
  try {
    return (
      new URL(a).hostname.replace(/^www\./, "") ===
      new URL(b).hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const url = new URL(href, baseUrl);

      if (!["http:", "https:"].includes(url.protocol)) return;
      if (!sameHost(url.toString(), baseUrl)) return;

      url.hash = "";
      links.add(url.toString());
    } catch {}
  });

  return [...links];
}

function extractPageSignals(html: string) {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg").remove();

  const title = $("title").first().text().trim() || undefined;
  const h1 = $("h1").first().text().trim();

  const bodyText = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);

  const purchaseWords = [
    "αγορά",
    "αγορα",
    "buy",
    "purchase",
    "add to cart",
    "καλάθι",
    "καλαθι",
  ];

  const actions = $("a,button")
    .map((_, el) => $(el).text())
    .get()
    .join(" ")
    .toLocaleLowerCase("el-GR");

  const hasPurchaseAction = purchaseWords.some((word) =>
    actions.includes(word),
  );

  return {
    title,
    text: `${h1}\n${bodyText}`,
    hasPurchaseAction,
  };
}

async function scanPage(
  url: string,
  origin: string,
): Promise<Candidate | null> {
  if (!(await isAllowedByRobots(url))) return null;

  let html: string;

  try {
    html = await fetchText(url);
  } catch {
    return null;
  }

  const signals = extractPageSignals(html);

  const { score, matchedKeywords } = scoreCandidate({
    url,
    title: signals.title,
    text: signals.text,
    hasPurchaseAction: signals.hasPurchaseAction,
    isOfficialDomain: sameHost(url, origin),
  });

  if (score < DISCOVERY_CONFIG.minScoreToStore) return null;

  const merchantName =
    signals.title?.split(/[|\-–—]/)[0]?.trim() ||
    new URL(origin).hostname.replace(/^www\./, "");

  return {
    sourceType: "OFFICIAL",
    sourceName: "Official Website Verifier",
    sourceUrl: url,
    title: signals.title,
    merchantName,
    possibleOfficialUrl: origin,
    score,
    matchedKeywords,
    notes: `Verifier score ${score}/100. Matches: ${matchedKeywords.join(", ")}`,
  };
}

export async function scanDomain(domainOrUrl: string): Promise<ScanResult> {
  const origin = canonicalOrigin(domainOrUrl);
  const errors: string[] = [];
  const candidates: Candidate[] = [];
  const urls = new Set<string>();

  // Cheap known-path checks first.
  urls.add(origin);
  urls.add(`${origin}/gift-card`);
  urls.add(`${origin}/giftcard`);
  urls.add(`${origin}/gift-cards`);
  urls.add(`${origin}/voucher`);
  urls.add(`${origin}/dwrokarta`);
  urls.add(`${origin}/dorokarta`);
  urls.add(`${origin}/doroepitagi`);

  // Homepage links are usually cheaper and more useful than a giant sitemap.
  try {
    if (await isAllowedByRobots(origin)) {
      const homepage = await fetchText(origin);

      for (const link of extractLinks(homepage, origin)) {
        const lower = link.toLocaleLowerCase("el-GR");

        if (
          lower.includes("gift") ||
          lower.includes("voucher") ||
          lower.includes("doro") ||
          lower.includes("dwro")
        ) {
          urls.add(link);
        }
      }
    }
  } catch (error) {
    errors.push(`homepage: ${String(error)}`);
  }

  // Sitemap discovery is supplementary, not allowed to dominate the scan.
  try {
    const sitemapMatches = await findGiftCardUrlsFromSitemaps(origin);

    for (const url of sitemapMatches) {
      urls.add(url);
      if (urls.size >= DISCOVERY_CONFIG.maxPagesPerDomain) break;
    }
  } catch (error) {
    errors.push(`sitemap: ${String(error)}`);
  }

  const selected = [...urls].slice(0, DISCOVERY_CONFIG.maxPagesPerDomain);
  const limit = pLimit(DISCOVERY_CONFIG.pageConcurrency);

  const scanned = await Promise.all(
    selected.map((url) =>
      limit(async () => {
        await sleep(DISCOVERY_CONFIG.perHostDelayMs);

        try {
          return await scanPage(url, origin);
        } catch (error) {
          errors.push(`${url}: ${String(error)}`);
          return null;
        }
      }),
    ),
  );

  for (const item of scanned) {
    if (item) candidates.push(item);
  }

  return {
    domain: origin,
    candidates,
    pagesChecked: selected.length,
    errors,
  };
}
