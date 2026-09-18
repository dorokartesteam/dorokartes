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
const MAX_CALLS = Math.max(1, Math.min(2500, Number(callsArg?.split("=")[1] || 1600)));

const OUT_DIR = path.join(process.cwd(), "data", "discovery", "mega-harvest-v6");
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

const NOISE = [
  /gift card holder/i,/card holder/i,/θήκη δωροκάρτας/i,
  /template/i,/mockup/i,/printable/i,/svg/i,/vector/i,
  /gift card printing/i,/custom gift card boxes/i,
  /market research/i,/market size/i,/market share/i,
  /business insider/i,/businesswire/i,/coupon/i,/promo code/i,
  /crypto/i,/bitcoin/i,/reseller/i,/gift card exchange/i,
  /steam wallet/i,/xbox gift card/i,/playstation gift card/i,
  /amazon gift card/i,/google play gift card/i
];

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function rootDomain(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

function isBlocked(domain: string) {
  return BLOCKED.some((b) => domain === b || domain.endsWith("." + b));
}

function giftSignal(text: string) {
  const t = text.toLowerCase();
  return [
    "gift card","gift cards","e-gift card","egift card","gift voucher","gift vouchers",
    "δωροκάρτα","δωροκάρτες","δωροεπιταγή","δωροεπιταγές","κάρτα δώρου","voucher δώρου"
  ].some((x) => t.includes(x));
}

function score(title: string, snippet: string, url: string) {
  const text = `${title} ${snippet} ${url}`;
  let s = 0;
  if (giftSignal(title)) s += 45;
  if (giftSignal(snippet)) s += 35;
  if (/gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ/i.test(url)) s += 20;
  if (/buy|shop|store|αγορά|online/i.test(text)) s += 5;
  if (/official|επίσημ/i.test(text)) s += 5;
  if (NOISE.some((r) => r.test(text))) s -= 70;
  return Math.max(0, Math.min(100, s));
}

function cleanMerchantName(title: string, domain: string) {
  let s = title
    .replace(/\s*[|–—-]\s*(gift\s*cards?|e-?gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές)).*$/i, "")
    .replace(/\s*[|–—-]\s*(official\s*(site|store)|online\s*shop).*$/i, "")
    .trim();

  if (!s || s.length < 2 || s.length > 90) {
    const base = domain
      .replace(/\.(com\.gr|net\.gr|org\.gr|gr|com|eu|co\.uk|de|fr|it|es|nl|be|at|ch)$/i, "")
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
    "fashion","women fashion","men fashion","shoes","sneakers","bags","accessories",
    "jewelry","watches","lingerie","swimwear","sportswear","outdoor",
    "beauty","cosmetics","perfume","skincare","haircare","nails","spa","massage",
    "wellness","gym","fitness","yoga","pilates",
    "electronics","technology","computers","gaming","mobile phones","audio",
    "home","furniture","decor","kitchen","lighting","garden",
    "books","toys","baby","kids","pet shop","flowers","gifts",
    "restaurant","cafe","bar","food","gourmet","wine","bakery","pastry",
    "hotel","resort","travel","airline","ferry","cruise","tour","experience",
    "escape room","cinema","theatre","museum","adventure","water sports",
    "car rental","motorcycle","car accessories","fuel","parking",
    "education","courses","language school","photography","art","hobby",
    "department store","supermarket","pharmacy","optics","eyewear",
    "hair salon","barber","tattoo","medical spa","dental","veterinary",
    "wedding","events","luxury","boutique","concept store"
  ];

  const greekPlaces = [
    "Greece","Athens","Piraeus","Glyfada","Kifisia","Marousi","Chalandri","Peristeri",
    "Thessaloniki","Kalamaria","Crete","Heraklion","Chania","Rethymno","Agios Nikolaos",
    "Rhodes","Corfu","Kos","Mykonos","Santorini","Paros","Naxos","Syros","Zakynthos",
    "Patras","Larissa","Volos","Ioannina","Kalamata","Kavala","Alexandroupoli",
    "Nafplio","Loutraki","Halkidiki","Meteora","Pelion"
  ];

  const euCountries = [
    "Cyprus","Italy","France","Germany","Spain","Portugal","Netherlands","Belgium",
    "Austria","Switzerland","Ireland","United Kingdom","Malta","Sweden","Denmark",
    "Finland","Norway","Poland","Czech Republic","Romania","Bulgaria","Croatia",
    "Slovenia","Hungary","Slovakia","Estonia","Latvia","Lithuania","Luxembourg"
  ];

  const intents = [
    '"gift card"','"gift cards"','"gift voucher"','"gift vouchers"',
    '"e-gift card"','"digital gift card"','"δωροκάρτα"','"δωροκάρτες"',
    '"δωροεπιταγή"','"δωροεπιταγές"'
  ];

  const q: string[] = [];

  // Greek-domain sweeps
  for (const intent of intents) {
    q.push(`site:.gr ${intent}`);
    q.push(`site:.com.gr ${intent}`);
  }

  // Category sweeps for Greece
  for (const c of categories) {
    q.push(`site:.gr "${c}" "gift card"`);
    q.push(`site:.gr "${c}" "gift voucher"`);
    q.push(`site:.gr "${c}" "δωροκάρτα"`);
    q.push(`"${c}" "gift card" Greece`);
    q.push(`"${c}" "gift voucher" Greece`);
    q.push(`"${c}" "δωροκάρτα" Greece`);
  }

  // City / island sweeps
  for (const place of greekPlaces) {
    for (const c of categories.slice(0, 45)) {
      q.push(`"${place}" "${c}" "gift card"`);
      q.push(`"${place}" "${c}" "gift voucher"`);
    }
  }

  // European merchant sweeps
  for (const country of euCountries) {
    for (const c of categories.slice(0, 40)) {
      q.push(`"${country}" "${c}" "gift card" official`);
    }
  }

  // Big-brand / localized-store discovery
  const commerceSignals = [
    '"ships to Greece"','"Greece store"','"Greek store"','"GR store"',
    '"Europe shipping"','"EU store"'
  ];

  for (const sig of commerceSignals) {
    for (const c of categories.slice(0, 35)) {
      q.push(`${sig} "${c}" "gift card"`);
    }
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
      hl: "en",
      num: 10,
    }),
  });

  if (!res.ok) throw new Error(`Serper HTTP ${res.status}: ${await res.text()}`);
  return await res.json() as any;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(RAW, "", "utf8");

  console.log("Dorokartes MEGA Harvest v6");
  console.log("==========================");
  console.log(`Requested max calls: ${MAX_CALLS}`);

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
    const urls = [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)];
    for (const u of urls) {
      const d = domainFromUrl(u);
      if (d) known.add(rootDomain(d));
    }
  }

  for (const d of discovery) {
    const dom = domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl);
    if (dom) known.add(rootDomain(dom));
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
  let blocked = 0;
  let alreadyKnown = 0;
  let lowSignal = 0;

  const concurrency = 6;

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async (query) => {
        try {
          return { query, data: await serper(query), error: null };
        } catch (e) {
          return {
            query,
            data: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );

    for (const r of results) {
      calls++;

      if (r.error) {
        errors++;
        console.log(`ERR ${calls}/${queries.length}: ${r.error}`);
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

        if (!domain || isBlocked(domain)) {
          blocked++;
          continue;
        }

        const root = rootDomain(domain);

        if (known.has(root)) {
          alreadyKnown++;
          continue;
        }

        const s = score(title, snippet, url);

        if (s < 55) {
          lowSignal++;
          continue;
        }

        const candidate = {
          score: s,
          domain: root,
          merchant_name: cleanMerchantName(title, root),
          possible_official_url: url,
          title,
          snippet,
          query: r.query,
        };

        const prev = candidates.get(root);
        if (!prev || s > prev.score) candidates.set(root, candidate);
      }
    }

    if (calls % 50 === 0 || calls >= queries.length) {
      console.log(
        `Progress ${calls}/${queries.length} | new unique=${candidates.size} | errors=${errors}`
      );
    }
  }

  const rows = [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const p100 = rows.filter((x) => x.score === 100);
  const p90 = rows.filter((x) => x.score >= 90 && x.score < 100);
  const p75 = rows.filter((x) => x.score >= 75 && x.score < 90);
  const p55 = rows.filter((x) => x.score >= 55 && x.score < 75);

  writeCsv(CSV, rows, [
    "score","domain","merchant_name","possible_official_url","title","snippet","query"
  ]);

  const summary = {
    requested_calls: MAX_CALLS,
    generated_queries: allQueries.length,
    executed_calls: calls,
    errors,
    organic_results: organic,
    blocked_results: blocked,
    already_known_results: alreadyKnown,
    low_signal_results: lowSignal,
    new_unique_candidate_domains: rows.length,
    score_100: p100.length,
    score_90_99: p90.length,
    score_75_89: p75.length,
    score_55_74: p55.length,
  };

  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log("");
  console.log("MEGA HARVEST SUMMARY");
  console.log(`Executed calls: ${calls}`);
  console.log(`Errors: ${errors}`);
  console.log(`Organic results: ${organic}`);
  console.log(`New unique candidate domains: ${rows.length}`);
  console.log(`- SCORE 100: ${p100.length}`);
  console.log(`- SCORE 90-99: ${p90.length}`);
  console.log(`- SCORE 75-89: ${p75.length}`);
  console.log(`- SCORE 55-74: ${p55.length}`);
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
