import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
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
const MAX_CALLS = Math.max(1, Math.min(1200, Number(callsArg?.split("=")[1] || 500)));
const IMPORT = args.includes("--import");

const OUT_DIR = path.join(process.cwd(), "data", "discovery", "mass-harvest-v5");
const RAW_JSONL = path.join(OUT_DIR, "raw-results.jsonl");
const CANDIDATE_CSV = path.join(OUT_DIR, "candidates.csv");
const SUMMARY_JSON = path.join(OUT_DIR, "summary.json");

const BLOCKED_DOMAINS = [
  "facebook.com","instagram.com","youtube.com","tiktok.com","linkedin.com",
  "pinterest.com","reddit.com","wikipedia.org","x.com","twitter.com",
  "amazon.com","amazon.de","ebay.com",
  "skroutz.gr","bestprice.gr","kouponia365.gr","xo.gr","vrisko.gr","vres.gr",
  "tripadvisor.com","booking.com",
  "google.com","google.gr","bing.com",
];

const BAD_WORDS = [
  "gift card holder","giftcard holder","card holder","θήκη δωροκάρτας",
  "template","mockup","printable","free download","svg","png","vector",
  "wedding invitation","birthday card template","greeting card",
  "razergold","razer gold","steam wallet code reseller","playstation code reseller",
];

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function rootDomain(domain: string) {
  return domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^shop\./, "")
    .replace(/^store\./, "")
    .replace(/^eshop\./, "");
}

function isBlockedDomain(domain: string) {
  return BLOCKED_DOMAINS.some((b) => domain === b || domain.endsWith("." + b));
}

function cleanMerchantName(title: string, domain: string) {
  let s = title
    .replace(/\s*[|–—-]\s*(gift\s*cards?|e-?gift\s*cards?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές)).*$/i, "")
    .replace(/\s*[|–—-]\s*(official\s*(site|store)|online\s*shop).*$/i, "")
    .trim();

  if (!s || s.length < 2 || s.length > 80) {
    const base = domain.split(".")[0].replace(/[-_]+/g, " ");
    s = base.replace(/\b\w/g, (m) => m.toUpperCase());
  }

  return s.slice(0, 100);
}

function giftSignal(text: string) {
  const t = text.toLowerCase();
  const strong = [
    "gift card","gift cards","e-gift card","egift card","gift voucher",
    "gift vouchers","δωροκάρτα","δωροκάρτες","δωροεπιταγή","δωροεπιταγές",
    "voucher δώρου","κάρτα δώρου"
  ];
  return strong.some((x) => t.includes(x));
}

function scoreResult(title: string, snippet: string, url: string) {
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  let score = 0;

  if (giftSignal(title)) score += 45;
  if (giftSignal(snippet)) score += 35;
  if (/gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ/i.test(url)) score += 20;
  if (/official|επίσημ/i.test(text)) score += 5;
  if (/buy|αγορά|shop|store|online/i.test(text)) score += 5;

  if (BAD_WORDS.some((w) => text.includes(w))) score -= 80;
  if (/coupon|κουπόνι έκπτωσης|promo code|discount code/i.test(text) && !giftSignal(text)) score -= 40;

  return Math.max(0, Math.min(100, score));
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

function buildQueries() {
  const base = [
    '"gift card" Greece',
    '"gift cards" Greece',
    '"e-gift card" Greece',
    '"gift voucher" Greece',
    '"gift vouchers" Greece',
    '"δωροκάρτα"',
    '"δωροκάρτες"',
    '"δωροεπιταγή"',
    '"δωροεπιταγές"',
    '"κάρτα δώρου"',
    '"voucher δώρου"',
    'site:.gr "gift card"',
    'site:.gr "gift cards"',
    'site:.gr "gift voucher"',
    'site:.gr "δωροκάρτα"',
    'site:.gr "δωροεπιταγή"',
    'site:.com.gr "gift card"',
    'site:.com.gr "δωροκάρτα"',
  ];

  const categories = [
    "fashion","clothing","shoes","sports","beauty","cosmetics","perfume",
    "jewelry","watches","home","furniture","decor","electronics","technology",
    "books","toys","baby","kids","pharmacy","wellness","spa","massage",
    "hotel","resort","travel","airline","ferry","restaurant","cafe",
    "food","wine","experience","escape room","cinema","theatre",
    "fitness","gym","yoga","hair salon","barber","optics","eyewear",
    "pet shop","flowers","gifts","department store","supermarket",
    "outdoor","marine","motorcycle","car accessories","tools","hobby",
    "gaming","music","education","courses","photography","printing",
    "wedding","lingerie","swimwear","leather","bags","luggage"
  ];

  const geo = [
    "Greece","Athens","Thessaloniki","Crete","Rhodes","Corfu","Mykonos",
    "Santorini","Patras","Larissa","Volos","Ioannina","Kalamata","Heraklion",
    "Chania","Kavala","Alexandroupoli","Kos","Nafplio"
  ];

  const q: string[] = [...base];

  for (const c of categories) {
    q.push(`"${c}" "gift card" Greece`);
    q.push(`"${c}" "gift voucher" Greece`);
    q.push(`site:.gr "${c}" "gift card"`);
    q.push(`site:.gr "${c}" "δωροκάρτα"`);
  }

  for (const g of geo) {
    q.push(`"${g}" "gift card"`);
    q.push(`"${g}" "gift voucher"`);
    q.push(`"${g}" "δωροκάρτα"`);
  }

  const globalRegions = [
    "Europe","UK","Italy","France","Germany","Spain","Netherlands","Austria",
    "Switzerland","Cyprus","Malta","Ireland","Portugal","Belgium","Sweden",
    "Denmark","Finland","Norway","Poland","Czech Republic","Romania","Bulgaria"
  ];

  for (const r of globalRegions) {
    q.push(`"${r}" retail "gift card" official`);
    q.push(`"${r}" fashion "gift card" official`);
    q.push(`"${r}" beauty "gift card" official`);
    q.push(`"${r}" travel "gift voucher" official`);
    q.push(`"${r}" hotel "gift card" official`);
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

  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}: ${await res.text()}`);
  }

  return await res.json() as any;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(RAW_JSONL, "", "utf8");

  console.log("Dorokartes Mass Harvest v5");
  console.log("==========================");
  console.log(`Max Serper calls: ${MAX_CALLS}`);
  console.log(`Import safe discoveries: ${IMPORT ? "YES" : "NO"}`);
  console.log("");

  const [production, discovery] = await Promise.all([
    prisma.merchant.findMany({
      select: {
        name: true,
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
    prisma.discoveryItem.findMany({
      select: {
        merchantName: true,
        possibleOfficialUrl: true,
        sourceUrl: true,
        sourceType: true,
        sourceName: true,
      },
    }),
  ]);

  const knownDomains = new Set<string>();
  for (const m of production) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const d = domainFromUrl(u);
      if (d) knownDomains.add(rootDomain(d));
    }
  }
  for (const d of discovery) {
    const dom = domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl);
    if (dom) knownDomains.add(rootDomain(dom));
  }

  const templateSource = discovery.find((x) =>
    /google|serper/i.test(x.sourceName || "")
  ) || discovery[0];

  const queries = buildQueries().slice(0, MAX_CALLS);
  const candidatesByDomain = new Map<string, any>();

  let calls = 0;
  let errors = 0;
  let organic = 0;
  let blocked = 0;
  let known = 0;
  let noGiftSignal = 0;

  const concurrency = 5;
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async (query) => {
        try {
          const data = await serper(query);
          return { query, data, error: null };
        } catch (error) {
          return {
            query,
            data: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    for (const r of results) {
      calls++;
      if (r.error) {
        errors++;
        console.log(`ERR ${calls}/${queries.length} | ${r.query} | ${r.error}`);
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
          RAW_JSONL,
          JSON.stringify({ query: r.query, title, snippet, url, domain }) + "\n",
          "utf8"
        );

        if (!domain || isBlockedDomain(domain)) {
          blocked++;
          continue;
        }

        const root = rootDomain(domain);
        if (knownDomains.has(root)) {
          known++;
          continue;
        }

        const score = scoreResult(title, snippet, url);
        if (score < 60) {
          noGiftSignal++;
          continue;
        }

        const prev = candidatesByDomain.get(root);
        const candidate = {
          domain: root,
          merchant_name: cleanMerchantName(title, root),
          possible_official_url: url,
          title,
          snippet,
          query: r.query,
          score,
        };

        if (!prev || score > prev.score) {
          candidatesByDomain.set(root, candidate);
        }
      }
    }

    if (calls % 25 === 0 || calls >= queries.length) {
      console.log(
        `Progress ${calls}/${queries.length} | new unique=${candidatesByDomain.size} | errors=${errors}`
      );
    }
  }

  const candidates = [...candidatesByDomain.values()]
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const high = candidates.filter((x) => x.score >= 90);
  const medium = candidates.filter((x) => x.score >= 75 && x.score < 90);
  const review = candidates.filter((x) => x.score >= 60 && x.score < 75);

  writeCsv(CANDIDATE_CSV, candidates, [
    "score","domain","merchant_name","possible_official_url",
    "title","snippet","query"
  ]);

  let imported = 0;
  let importSkipped = 0;

  if (IMPORT) {
    if (!templateSource) {
      throw new Error("Cannot import: no existing DiscoveryItem available to reuse sourceType.");
    }

    for (const c of high) {
      const already = await prisma.discoveryItem.findFirst({
        where: {
          OR: [
            { possibleOfficialUrl: { contains: c.domain, mode: "insensitive" } },
            { sourceUrl: { contains: c.domain, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });

      if (already) {
        importSkipped++;
        continue;
      }

      await prisma.discoveryItem.create({
        data: {
          sourceType: templateSource.sourceType,
          sourceName: "Google Serper Mass Harvest v5",
          sourceUrl: c.possible_official_url,
          title: c.title,
          merchantName: c.merchant_name,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: c.possible_official_url,
          notes:
            `[MASS_HARVEST_V5]\n` +
            `Score=${c.score}\n` +
            `Domain=${c.domain}\n` +
            `Query=${c.query}\n` +
            `Snippet=${c.snippet}`,
        },
      });

      imported++;
    }
  }

  const summary = {
    calls,
    errors,
    organic_results: organic,
    blocked_results: blocked,
    already_known_domains: known,
    low_signal_results: noGiftSignal,
    new_unique_candidate_domains: candidates.length,
    high_safe_90_plus: high.length,
    medium_75_89: medium.length,
    review_60_74: review.length,
    imported_high_safe: imported,
    import_skipped_existing: importSkipped,
  };

  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log("");
  console.log("HARVEST SUMMARY");
  console.log(`Serper calls: ${calls}`);
  console.log(`Errors: ${errors}`);
  console.log(`Organic results: ${organic}`);
  console.log(`New unique candidate domains: ${candidates.length}`);
  console.log(`- HIGH 90+: ${high.length}`);
  console.log(`- MEDIUM 75-89: ${medium.length}`);
  console.log(`- REVIEW 60-74: ${review.length}`);
  console.log(`Imported HIGH 90+: ${imported}`);
  console.log(`Import skipped existing: ${importSkipped}`);
  console.log("");
  console.log(`CSV: ${CANDIDATE_CSV}`);
  console.log(`Summary: ${SUMMARY_JSON}`);

  if (!IMPORT) {
    console.log("");
    console.log("READ/PLAN ONLY. No DiscoveryItems were created.");
    console.log("Re-run with --import only after reviewing HIGH 90+ sample.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
