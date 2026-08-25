import { XMLParser } from "fast-xml-parser";
import { DISCOVERY_CONFIG } from "./config";
import { fetchText, isAllowedByRobots } from "./http";
import { looksLikeGiftCardUrl } from "./keywords";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function arr<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function discoverSitemaps(origin: string): Promise<string[]> {
  const defaults = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];

  try {
    const robots = await fetchText(`${origin}/robots.txt`);

    const fromRobots = robots
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
      .filter(Boolean);

    return [...new Set([...fromRobots, ...defaults])].slice(
      0,
      DISCOVERY_CONFIG.maxSitemapFiles,
    );
  } catch {
    return defaults;
  }
}

async function readSitemap(
  sitemapUrl: string,
  visited: Set<string>,
  results: Set<string>,
): Promise<void> {
  if (visited.has(sitemapUrl)) return;
  if (visited.size >= DISCOVERY_CONFIG.maxSitemapFiles) return;
  if (results.size >= DISCOVERY_CONFIG.maxSitemapUrls) return;

  visited.add(sitemapUrl);

  if (!(await isAllowedByRobots(sitemapUrl))) return;

  let xml: string;
  try {
    xml = await fetchText(sitemapUrl);
  } catch {
    return;
  }

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch {
    return;
  }

  const indexes = arr(parsed?.sitemapindex?.sitemap);

  for (const entry of indexes) {
    if (visited.size >= DISCOVERY_CONFIG.maxSitemapFiles) break;

    const loc = typeof entry === "string" ? entry : entry?.loc;
    if (!loc) continue;

    // Prefer gift/product/page related sitemap branches and avoid
    // walking every possible ecommerce sitemap.
    const lower = String(loc).toLowerCase();
    const interesting =
      lower.includes("product") ||
      lower.includes("page") ||
      lower.includes("gift") ||
      lower.includes("voucher") ||
      indexes.length <= 5;

    if (interesting) {
      await readSitemap(String(loc), visited, results);
    }
  }

  const urls = arr(parsed?.urlset?.url);

  for (const entry of urls) {
    const loc = typeof entry === "string" ? entry : entry?.loc;
    if (!loc) continue;

    const url = String(loc);

    // Only retain likely gift-card URLs. This avoids keeping thousands
    // of unrelated sitemap URLs in memory.
    if (looksLikeGiftCardUrl(url)) {
      results.add(url);
    }

    if (results.size >= DISCOVERY_CONFIG.maxSitemapUrls) break;
  }
}

export async function findGiftCardUrlsFromSitemaps(
  domainOrUrl: string,
): Promise<string[]> {
  const base = domainOrUrl.startsWith("http")
    ? new URL(domainOrUrl)
    : new URL(`https://${domainOrUrl}`);

  const origin = base.origin;
  const sitemaps = await discoverSitemaps(origin);

  const visited = new Set<string>();
  const urls = new Set<string>();

  for (const sitemap of sitemaps) {
    if (visited.size >= DISCOVERY_CONFIG.maxSitemapFiles) break;

    await readSitemap(sitemap, visited, urls);

    if (urls.size >= DISCOVERY_CONFIG.maxSitemapUrls) break;
  }

  return [...urls];
}
