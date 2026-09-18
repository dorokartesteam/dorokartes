import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!SERPER_API_KEY) throw new Error("SERPER_API_KEY is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const args = process.argv.slice(2);
const callsArg = args.find((x) => x.startsWith("--calls="));
const MAX_CALLS = Math.max(1, Math.min(1400, Number(callsArg?.split("=")[1] || 700)));

const OUT_DIR = path.join(process.cwd(), "data", "discovery", "focused-harvest-v7");
const RAW = path.join(OUT_DIR, "raw-results.jsonl");
const CSV = path.join(OUT_DIR, "candidates.csv");
const SUMMARY = path.join(OUT_DIR, "summary.json");

const BLOCKED = [
  "facebook.com","instagram.com","youtube.com","tiktok.com","linkedin.com",
  "pinterest.com","reddit.com","wikipedia.org","x.com","twitter.com",
  "amazon.com","amazon.de","ebay.com","aliexpress.com",
  "skroutz.gr","bestprice.gr","kouponia365.gr","xo.gr","vrisko.gr","vres.gr",
  "tripadvisor.com","booking.com",
  "google.com","google.gr","bing.com"
];

const BAD = [
  /gift card holder/i,/card holder/i,/template/i,/mockup/i,/printable/i,
  /gift card printing/i,/custom gift card boxes/i,/market research/i,/market size/i,
  /market share/i,/business insider/i,/businesswire/i,/coupon/i,/promo code/i,
  /crypto/i,/bitcoin/i,/reseller/i,/gift card exchange/i,/steam wallet/i,
  /xbox gift card/i,/playstation gift card/i,/amazon gift card/i,/google play gift card/i
];

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function isBlocked(domain: string) {
  return BLOCKED.some((b) => domain === b || domain.endsWith("." + b));
}

function giftSignal(text: string) {
  const t = text.toLowerCase();
  return [
    "gift card","gift cards","gift voucher","gift vouchers",
    "e-gift card","egift card","digital gift card",
    "δωροκάρτα","δωροκάρτες","δωροεπιταγή","δωροεπιταγές","κάρτα δώρου"
  ].some((x) => t.includes(x));
}

function score(title: string, snippet: string, url: string) {
  const text = `${title} ${snippet} ${url}`;
  let s = 0;
  if (giftSignal(title)) s += 50;
  if (giftSignal(snippet)) s += 30;
  if (/gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ/i.test(url)) s += 20;
  if (/buy|shop|store|online|αγορά/i.test(text)) s += 5;
  if (BAD.some((r) => r.test(text))) s -= 80;
  return Math.max(0, Math.min(100, s));
}

function cleanMerchantName(title: string, domain: string) {
  let s = title
    .replace(/\s*[|–—-]\s*(gift\s*cards?|e-?gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές)).*$/i, "")
    .replace(/^\s*(gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές))\s*[-|–—:]?\s*/i, "")
    .trim();

  if (!s || s.length < 2 || s.length > 80) {
    const base = domain
      .replace(/\.(com\.gr|net\.gr|org\.gr|gr)$/i, "")
      .split(".")
      .pop() || domain;

    s = base.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  return s.slice(0, 100);
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    "\uFEFF" + [
      headers.map(csvEscape).join(","),
      ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))
    ].join("\n") + "\n",
    "utf8"
  );
}

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

function buildQueries() {
  const categories = [
    "fashion","clothing","shoes","bags","jewelry","watches","lingerie",
    "beauty","cosmetics","perfume","skincare","nails","spa","massage","wellness",
    "hotel","resort","restaurant","cafe","travel","tour","experience",
    "home","furniture","decor","kids","baby","toys","books","sports","fitness",
    "optics","pet shop","flowers","gifts","outdoor","motorcycle","food","wine"
  ];

  const greekPlaces = [
    "Athens","Piraeus","Glyfada","Kifisia","Marousi","Chalandri",
    "Thessaloniki","Kalamaria","Crete","Heraklion","Chania","Rethymno",
    "Rhodes","Corfu","Kos","Mykonos","Santorini","Paros","Naxos",
    "Patras","Larissa","Volos","Ioannina","Kalamata","Kavala","Nafplio","Halkidiki"
  ];

  const q: string[] = [];

  const greekIntents = [
    '"gift card"','"gift cards"','"gift voucher"','"gift vouchers"',
    '"δωροκάρτα"','"δωροκάρτες"','"δωροεπιταγή"','"δωροεπιταγές"'
  ];

  for (const intent of greekIntents) {
    q.push(`site:.gr ${intent}`);
    q.push(`site:.com.gr ${intent}`);
  }

  for (const c of categories) {
    q.push(`site:.gr "${c}" "gift card"`);
    q.push(`site:.gr "${c}" "gift voucher"`);
    q.push(`site:.gr "${c}" "δωροκάρτα"`);
    q.push(`site:.gr "${c}" "δωροεπιταγή"`);
  }

  for (const place of greekPlaces) {
    for (const c of ["spa","massage","hotel","restaurant","beauty","fashion","jewelry","experience","fitness","kids"]) {
      q.push(`"${place}" "${c}" "gift card"`);
      q.push(`"${place}" "${c}" "gift voucher"`);
      q.push(`"${place}" "${c}" "δωροκάρτα"`);
    }
  }

  for (const c of categories) {
    q.push(`site:.gr inurl:gift-card "${c}"`);
    q.push(`site:.gr inurl:giftcard "${c}"`);
    q.push(`site:.gr inurl:gift-voucher "${c}"`);
    q.push(`site:.gr inurl:dorokarta "${c}"`);
  }

  return uniq(q);
}

async function serper(query: string) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "gr",
      hl: "el",
      num: 10,
    }),
  });

  if (!res.ok) throw new Error(`Serper HTTP ${res.status}: ${await res.text()}`);
  return await res.json() as any;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(RAW, "", "utf8");

  console.log("Dorokartes Focused Harvest v7");
  console.log("=============================");
  console.log(`Max calls: ${MAX_CALLS}`);

  const [production, discovery] = await Promise.all([
    prisma.merchant.findMany({
      select: {
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
    prisma.discoveryItem.findMany({
      select: { possibleOfficialUrl: true, sourceUrl: true },
    }),
  ]);

  const known = new Set<string>();

  for (const m of production) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const d = domainFromUrl(u);
      if (d) known.add(d);
    }
  }

  for (const d of discovery) {
    const dom = domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl);
    if (dom) known.add(dom);
  }

  const allQueries = buildQueries();
  const queries = allQueries.slice(0, MAX_CALLS);

  console.log(`Generated unique queries: ${allQueries.length}`);
  console.log(`Calls to execute: ${queries.length}`);
  console.log(`Known domains excluded: ${known.size}`);
  console.log("");

  const candidates = new Map<string, any>();

  let calls = 0;
  let errors = 0;
  let organic = 0;
  let alreadyKnown = 0;
  let lowSignal = 0;
  let quotaExhausted = false;

  const concurrency = 5;

  outer:
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);

    const results = await Promise.all(batch.map(async (query) => {
      try {
        return { query, data: await serper(query), error: null };
      } catch (e) {
        return {
          query,
          data: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }));

    for (const r of results) {
      calls++;

      if (r.error) {
        errors++;
        console.log(`ERR ${calls}/${queries.length}: ${r.error}`);

        if (/Not enough credits/i.test(r.error)) {
          quotaExhausted = true;
          console.log("Quota exhausted. Stopping early.");
          break outer;
        }

        continue;
      }

      const items = Array.isArray(r.data?.organic) ? r.data.organic : [];
      organic += items.length;

      for (const item of items) {
        const url = String(item.link || "");
        const title = String(item.title || "");
        const snippet = String(item.snippet || "");
        const domain = domainFromUrl(url);

        fs.appendFileSync(
          RAW,
          JSON.stringify({ query: r.query, title, snippet, url, domain }) + "\n",
          "utf8"
        );

        if (!domain || isBlocked(domain)) continue;
        if (known.has(domain)) {
          alreadyKnown++;
          continue;
        }

        const s = score(title, snippet, url);
        if (s < 70) {
          lowSignal++;
          continue;
        }

        const candidate = {
          score: s,
          domain,
          merchant_name: cleanMerchantName(title, domain),
          possible_official_url: url,
          title,
          snippet,
          query: r.query,
        };

        const prev = candidates.get(domain);
        if (!prev || s > prev.score) candidates.set(domain, candidate);
      }
    }

    if (calls % 25 === 0 || calls >= queries.length) {
      console.log(`Progress ${calls}/${queries.length} | new unique=${candidates.size} | errors=${errors}`);
    }
  }

  const rows = [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const s100 = rows.filter((x) => x.score === 100);
  const s90 = rows.filter((x) => x.score >= 90 && x.score < 100);
  const s70 = rows.filter((x) => x.score >= 70 && x.score < 90);

  writeCsv(CSV, rows, [
    "score","domain","merchant_name","possible_official_url","title","snippet","query"
  ]);

  fs.writeFileSync(SUMMARY, JSON.stringify({
    requested_calls: MAX_CALLS,
    generated_queries: allQueries.length,
    executed_calls: calls,
    quota_exhausted: quotaExhausted,
    errors,
    organic_results: organic,
    already_known_results: alreadyKnown,
    low_signal_results: lowSignal,
    new_unique_candidate_domains: rows.length,
    score_100: s100.length,
    score_90_99: s90.length,
    score_70_89: s70.length,
  }, null, 2) + "\n", "utf8");

  console.log("");
  console.log("FOCUSED HARVEST SUMMARY");
  console.log(`Executed calls: ${calls}`);
  console.log(`Quota exhausted: ${quotaExhausted ? "YES" : "NO"}`);
  console.log(`Errors: ${errors}`);
  console.log(`Organic results: ${organic}`);
  console.log(`New unique candidate domains: ${rows.length}`);
  console.log(`- SCORE 100: ${s100.length}`);
  console.log(`- SCORE 90-99: ${s90.length}`);
  console.log(`- SCORE 70-89: ${s70.length}`);
  console.log("");
  console.log(`CSV: ${CSV}`);
  console.log(`Summary: ${SUMMARY}`);
  console.log("");
  console.log("READ ONLY. No database changes were made.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
