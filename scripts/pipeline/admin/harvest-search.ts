import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { getDomain } from "tldts";

const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");

function argInt(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((x) => x.startsWith(prefix));
  if (!raw) return fallback;
  const n = Number(raw.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const MAX_RESULTS_PER_QUERY = Math.min(argInt("results", 50), 100);
const MAX_QUERIES = Math.min(argInt("queries", 12), 30);
const CONCURRENCY = Math.min(argInt("concurrency", 3), 5);

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "discovery", "mass-search");
const RAW_CSV = path.join(OUT_DIR, "mass-search-results.csv");
const MERCHANT_CSV = path.join(OUT_DIR, "mass-search-merchants.csv");

const QUERIES = [
  'site:.gr "gift card"',
  'site:.gr "e-gift card"',
  'site:.gr "gift voucher"',
  'site:.gr "δωροκάρτα"',
  'site:.gr "δωροκαρτα"',
  'site:.gr "δωροεπιταγή"',
  'site:.gr "δωροεπιταγη"',
  '"gift card" Ελλάδα κατάστημα',
  '"δωροκάρτα" αγορά online',
  '"δωροεπιταγή" κατάστημα',
  '"e-gift card" Greece',
  '"gift voucher" Greece',
];

const BLOCKED_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "wikipedia.org",
  "skroutz.gr",
  "bestprice.gr",
  "kouponia365.gr",
  "tripadvisor.com",
  "booking.com",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
];

const NEGATIVE_PATH_SIGNALS = [
  "/blog/",
  "/news/",
  "/category/",
  "/tag/",
  "/forum/",
  "/search?",
];

const STRONG_SIGNALS = [
  "gift-card",
  "giftcard",
  "e-gift",
  "egift",
  "gift-voucher",
  "giftvoucher",
  "dorokarta",
  "doro-karta",
  "doroepitagi",
  "doro-epitagi",
  "δωροκαρ",
  "δωροεπιτα",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["gclid", "fbclid", "msclkid"].includes(key.toLowerCase())
      ) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return null;
  }
}

function isBlockedHost(host: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}

function registeredDomain(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function pageSignalScore(url: string, title: string, snippet: string) {
  const text = decodeURIComponent(`${url} ${title} ${snippet}`).toLowerCase();
  let score = 0;

  for (const sig of STRONG_SIGNALS) {
    if (text.includes(sig)) score += 2;
  }

  const u = new URL(url);
  if (u.hostname.endsWith(".gr")) score += 2;
  if (NEGATIVE_PATH_SIGNALS.some((s) => u.pathname.toLowerCase().includes(s))) score -= 2;
  if (/\b(gift set|gift guide|gift ideas|δωρα για|ιδεες για δωρα)\b/i.test(text)) score -= 3;

  return score;
}

type SearchResult = {
  engine: string;
  query: string;
  rank: number;
  url: string;
  title: string;
  snippet: string;
  domain: string;
  score: number;
};

async function fetchText(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36",
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        accept: "text/html,application/xhtml+xml",
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchBing(query: string, limit: number): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  const pages = Math.ceil(limit / 10);

  for (let page = 0; page < pages; page++) {
    const first = page * 10 + 1;
    const url =
      "https://www.bing.com/search?" +
      new URLSearchParams({
        q: query,
        count: "10",
        first: String(first),
        setlang: "el",
        cc: "gr",
      }).toString();

    let html: string;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.log(`[BING] ${query} page=${page + 1} failed: ${e instanceof Error ? e.message : e}`);
      break;
    }

    const $ = cheerio.load(html);

    $("li.b_algo").each((_, el) => {
      if (out.length >= limit) return false;

      const a = $(el).find("h2 a").first();
      const href = normalizeUrl(a.attr("href"));
      if (!href) return;

      const title = a.text().replace(/\s+/g, " ").trim();
      const snippet = $(el).find(".b_caption p").first().text().replace(/\s+/g, " ").trim();

      let host = "";
      try {
        host = new URL(href).hostname.toLowerCase();
      } catch {
        return;
      }

      if (isBlockedHost(host)) return;

      const domain = registeredDomain(href);
      if (!domain) return;

      out.push({
        engine: "BING",
        query,
        rank: out.length + 1,
        url: href,
        title,
        snippet,
        domain,
        score: pageSignalScore(href, title, snippet),
      });
    });

    await sleep(500 + Math.floor(Math.random() * 500));
  }

  return out;
}

function decodeDdgRedirect(href: string) {
  try {
    const u = new URL(href, "https://html.duckduckgo.com/");
    const uddg = u.searchParams.get("uddg");
    return normalizeUrl(uddg ? decodeURIComponent(uddg) : u.toString());
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const out: SearchResult[] = [];

  let html: string;
  try {
    html = await fetchText("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ q: query, kl: "gr-el" }).toString(),
    });
  } catch (e) {
    console.log(`[DDG] ${query} failed: ${e instanceof Error ? e.message : e}`);
    return out;
  }

  const $ = cheerio.load(html);

  $(".result").each((_, el) => {
    if (out.length >= limit) return false;

    const a = $(el).find(".result__a").first();
    const hrefRaw = a.attr("href");
    const href = hrefRaw ? decodeDdgRedirect(hrefRaw) : null;
    if (!href) return;

    const title = a.text().replace(/\s+/g, " ").trim();
    const snippet = $(el).find(".result__snippet").first().text().replace(/\s+/g, " ").trim();

    let host = "";
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {
      return;
    }

    if (isBlockedHost(host)) return;

    const domain = registeredDomain(href);
    if (!domain) return;

    out.push({
      engine: "DUCKDUCKGO",
      query,
      rank: out.length + 1,
      url: href,
      title,
      snippet,
      domain,
      score: pageSignalScore(href, title, snippet),
    });
  });

  return out;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => lane()),
  );

  return out;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function merchantGuessFromDomain(domain: string) {
  const base = domain.split(".")[0];
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b(www|shop|eshop|store|official)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function importToDb(results: SearchResult[]) {
  const { PrismaClient, SourceType, DiscoveryStatus } =
    await import("../../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for --import.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  let created = 0;
  let skipped = 0;

  try {
    for (const r of results) {
      if (r.score < 2) continue;

      const fingerprint = crypto
        .createHash("sha256")
        .update(`MASS_SEARCH|${r.domain}|${r.url}`)
        .digest("hex");

      const existing = await prisma.discoveryItem.findFirst({
        where: { fingerprint },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.SEARCH_ENGINE,
          sourceName: "Mass Search Discovery",
          sourceUrl: r.url,
          title: r.title || null,
          merchantName: merchantGuessFromDomain(r.domain) || r.domain,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: r.url,
          fingerprint,
          notes: [
            `Engine: ${r.engine}`,
            `Query: ${r.query}`,
            `Registered domain: ${r.domain}`,
            `Signal score: ${r.score}`,
            r.snippet ? `Snippet: ${r.snippet.slice(0, 500)}` : "",
          ].filter(Boolean).join(" | "),
        },
      });

      created++;
    }
  } finally {
    await prisma.$disconnect();
  }

  return { created, skipped };
}

async function main() {
  console.log("Dorokartes Mass Search Harvester v1");
  console.log("===================================");
  console.log(`Mode: ${APPLY ? "HARVEST" : "PLAN"}`);
  console.log(`Import to DB: ${IMPORT ? "YES" : "NO"}`);
  console.log(`Queries: ${Math.min(MAX_QUERIES, QUERIES.length)}`);
  console.log(`Max results/query/engine: ${MAX_RESULTS_PER_QUERY}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  const queries = QUERIES.slice(0, MAX_QUERIES);

  if (!APPLY) {
    for (const q of queries) console.log(`- ${q}`);
    console.log("");
    console.log("PLAN ONLY. No search pages fetched.");
    console.log(
      `Run: npm run pipeline:harvest-search -- --apply --queries=${queries.length} --results=${MAX_RESULTS_PER_QUERY}`,
    );
    return;
  }

  const batches = await runPool(queries, CONCURRENCY, async (query, i) => {
    console.log(`[${i + 1}/${queries.length}] ${query}`);

    const [bing, ddg] = await Promise.all([
      searchBing(query, MAX_RESULTS_PER_QUERY),
      searchDuckDuckGo(query, Math.min(MAX_RESULTS_PER_QUERY, 30)),
    ]);

    console.log(
      `  -> Bing ${bing.length}, DuckDuckGo ${ddg.length}`,
    );

    return [...bing, ...ddg];
  });

  const all = batches.flat();

  // Exact URL dedupe.
  const byUrl = new Map<string, SearchResult>();
  for (const r of all) {
    const old = byUrl.get(r.url);
    if (!old || r.score > old.score) byUrl.set(r.url, r);
  }

  const uniqueUrls = [...byUrl.values()];

  // Domain aggregation: keep strongest candidate URL per domain.
  const byDomain = new Map<
    string,
    SearchResult & { hits: number; queries: Set<string>; engines: Set<string> }
  >();

  for (const r of uniqueUrls) {
    const old = byDomain.get(r.domain);
    if (!old) {
      byDomain.set(r.domain, {
        ...r,
        hits: 1,
        queries: new Set([r.query]),
        engines: new Set([r.engine]),
      });
      continue;
    }

    old.hits++;
    old.queries.add(r.query);
    old.engines.add(r.engine);

    if (r.score > old.score) {
      old.url = r.url;
      old.title = r.title;
      old.snippet = r.snippet;
      old.score = r.score;
      old.query = r.query;
      old.engine = r.engine;
      old.rank = r.rank;
    }
  }

  const merchants = [...byDomain.values()]
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.hits - a.hits);

  writeCsv(
    RAW_CSV,
    uniqueUrls.map((r) => ({
      engine: r.engine,
      query: r.query,
      rank: r.rank,
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      domain: r.domain,
      score: r.score,
    })),
    ["engine", "query", "rank", "url", "title", "snippet", "domain", "score"],
  );

  writeCsv(
    MERCHANT_CSV,
    merchants.map((m) => ({
      merchant_guess: merchantGuessFromDomain(m.domain),
      domain: m.domain,
      best_url: m.url,
      title: m.title,
      score: m.score,
      hits: m.hits,
      engines: [...m.engines].join("|"),
      queries: [...m.queries].join(" | "),
    })),
    [
      "merchant_guess",
      "domain",
      "best_url",
      "title",
      "score",
      "hits",
      "engines",
      "queries",
    ],
  );

  let imported = { created: 0, skipped: 0 };

  if (IMPORT) {
    imported = await importToDb(
      merchants.map((m) => ({
        engine: [...m.engines].join("+"),
        query: [...m.queries].join(" | "),
        rank: m.rank,
        url: m.url,
        title: m.title,
        snippet: m.snippet,
        domain: m.domain,
        score: m.score,
      })),
    );
  }

  console.log("");
  console.log("===================================");
  console.log(`Raw search hits: ${all.length}`);
  console.log(`Unique URLs: ${uniqueUrls.length}`);
  console.log(`Unique merchant domains (score>=2): ${merchants.length}`);
  console.log(`DiscoveryItems created: ${imported.created}`);
  console.log(`Existing DiscoveryItems skipped: ${imported.skipped}`);
  console.log(`Results CSV: ${RAW_CSV}`);
  console.log(`Merchants CSV: ${MERCHANT_CSV}`);
  console.log("OpenAI/API calls: 0");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
