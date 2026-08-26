import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "discovery", "google");

const BASELINE_FILES = [
  path.join(OUT_DIR, "google-serper-hits-v1.csv"),
  path.join(OUT_DIR, "google-serper-query-lab-v2.csv"),
  path.join(OUT_DIR, "google-serper-focused-domains-v3.csv"),
  path.join(OUT_DIR, "google-clean-dedupe-v1.csv"),
  path.join(OUT_DIR, "google-quality-strict-v2.csv"),
];

const OUT_HITS = path.join(OUT_DIR, "google-serper-wave2-hits-v4.csv");
const OUT_DOMAINS = path.join(OUT_DIR, "google-serper-wave2-domains-v4.csv");
const OUT_REPORT = path.join(OUT_DIR, "google-serper-wave2-report-v4.csv");

const API_KEY = process.env.SERPER_API_KEY || "";

const budgetArg = process.argv.find((x) => x.startsWith("--budget="));
const BUDGET = Math.max(1, Number(budgetArg?.split("=")[1] || "400"));

const pagesArg = process.argv.find((x) => x.startsWith("--pages="));
const PAGES = Math.max(1, Math.min(5, Number(pagesArg?.split("=")[1] || "3")));

const DELAY_MS = Math.max(
  200,
  Number(process.env.GOOGLE_HARVEST_DELAY_MS || "350"),
);

const BLOCKED = [
  "google.com","youtube.com","facebook.com","instagram.com","linkedin.com",
  "tiktok.com","pinterest.com","x.com","twitter.com","wikipedia.org",
  "bestprice.gr","skroutz.gr","kouponia365.gr","vrisko.gr","xo.gr",
  "reddit.com","tripadvisor.com","tripadvisor.com.gr","booking.com",
  "amazon.com","ebay.com","quora.com","yelp.com",
  "blogspot.com","blogspot.gr","aade.gr","gov.gr","auth.gr",
  "piraeusbank.gr","alpha.gr","eurobank.gr","nbg.gr","visa.gr",
  "mastercard.gr","businesswire.com","ons.gov.uk","ot.gr","in.gr",
  "mononews.gr","kathimerini.gr","newsit.gr","bovary.gr","gtp.gr",
  "jobfind.gr","freelancer.gr","kethea.gr","mindigital.gr","ekkomed.gr",
  "revolut.com","webnode.gr","scribd.com","hotels.com","giftly.com",
  "giftya.com","uquid.com","giftpro.co.uk","hotelgift.com",
  "hotelgiftcard.com","giftingowl.com","gogift.com","cardtonic.com",
  "baxity.com","sendvalu.com","giftcardmarket.com","mallgiftcard.com.cy",
  "coincards.com","ubuy.com.gr","directmarket.gr","hellenicvoucher.gr",
];

const QUERY_PACK = [
  // SPA / wellness / beauty
  'site:.gr spa "gift card"',
  'site:.gr massage "gift card"',
  'site:.gr wellness "gift card"',
  'site:.gr hammam "gift card"',
  'site:.gr beauty salon "gift card"',
  'site:.gr αισθητική "gift card"',
  'site:.gr κομμωτήριο "gift card"',
  'site:.gr nail salon "gift card"',
  'site:.gr barber "gift card"',
  'site:.gr skincare "gift card"',
  'site:.gr cosmetics "gift card"',
  'site:.gr καλλυντικά "gift card"',

  // Food / drink / dining
  'site:.gr restaurant "gift card"',
  'site:.gr εστιατόριο "gift card"',
  'site:.gr fine dining "gift card"',
  'site:.gr brunch "gift card"',
  'site:.gr bar "gift card"',
  'site:.gr wine bar "gift card"',
  'site:.gr cafe "gift card"',
  'site:.gr bakery "gift card"',
  'site:.gr patisserie "gift card"',
  'site:.gr delicatessen "gift card"',
  'site:.gr κρασί "gift card"',
  'site:.gr wine "gift card"',
  'site:.gr gourmet "gift card"',

  // Hotels / travel
  'site:.gr hotel "gift card"',
  'site:.gr ξενοδοχείο "gift card"',
  'site:.gr resort "gift card"',
  'site:.gr boutique hotel "gift card"',
  'site:.gr villa "gift card"',
  'site:.gr travel "gift card"',
  'site:.gr ταξίδια "gift card"',
  'site:.gr travel agency "gift card"',
  'site:.gr tours "gift card"',
  'site:.gr excursions "gift card"',
  'site:.gr sailing "gift card"',
  'site:.gr cruise "gift card"',
  'site:.gr activities "gift card"',
  'site:.gr εμπειρίες "gift card"',

  // Fashion / accessories
  'site:.gr fashion "gift card"',
  'site:.gr ρούχα "gift card"',
  'site:.gr clothing "gift card"',
  'site:.gr boutique "gift card"',
  'site:.gr lingerie "gift card"',
  'site:.gr shoes "gift card"',
  'site:.gr παπούτσια "gift card"',
  'site:.gr sneakers "gift card"',
  'site:.gr bags "gift card"',
  'site:.gr accessories "gift card"',
  'site:.gr jewelry "gift card"',
  'site:.gr jewellery "gift card"',
  'site:.gr κοσμήματα "gift card"',
  'site:.gr watches "gift card"',
  'site:.gr ρολόγια "gift card"',

  // Kids / books / toys
  'site:.gr kids "gift card"',
  'site:.gr παιδικά "gift card"',
  'site:.gr baby "gift card"',
  'site:.gr toys "gift card"',
  'site:.gr παιχνίδια "gift card"',
  'site:.gr books "gift card"',
  'site:.gr βιβλία "gift card"',
  'site:.gr βιβλιοπωλείο "gift card"',
  'site:.gr stationery "gift card"',

  // Sports / hobbies / music / gaming
  'site:.gr sports "gift card"',
  'site:.gr αθλητικά "gift card"',
  'site:.gr fitness "gift card"',
  'site:.gr gym "gift card"',
  'site:.gr yoga "gift card"',
  'site:.gr outdoor "gift card"',
  'site:.gr camping "gift card"',
  'site:.gr cycling "gift card"',
  'site:.gr tennis "gift card"',
  'site:.gr music "gift card"',
  'site:.gr μουσικά "gift card"',
  'site:.gr gaming "gift card"',
  'site:.gr games "gift card"',
  'site:.gr photography "gift card"',
  'site:.gr hobby "gift card"',

  // Home / decor / flowers / gifts
  'site:.gr home "gift card"',
  'site:.gr home decor "gift card"',
  'site:.gr furniture "gift card"',
  'site:.gr έπιπλα "gift card"',
  'site:.gr kitchen "gift card"',
  'site:.gr candles "gift card"',
  'site:.gr flowers "gift card"',
  'site:.gr λουλούδια "gift card"',
  'site:.gr ανθοπωλείο "gift card"',
  'site:.gr gifts "gift card"',
  'site:.gr δώρα "gift card"',

  // Tech / pharmacy / pet / education
  'site:.gr technology "gift card"',
  'site:.gr tech "gift card"',
  'site:.gr electronics "gift card"',
  'site:.gr pharmacy "gift card"',
  'site:.gr φαρμακείο "gift card"',
  'site:.gr pet "gift card"',
  'site:.gr κατοικίδια "gift card"',
  'site:.gr education "gift card"',
  'site:.gr lessons "gift card"',
  'site:.gr cooking class "gift card"',

  // Strong commercial language
  'site:.gr "gift voucher"',
  'site:.gr "gift certificate"',
  'site:.gr "digital gift card"',
  'site:.gr "e-gift card"',
  'site:.gr "eGift Card"',
  'site:.gr "buy gift card"',
  'site:.gr "αγορά gift card"',
  'site:.gr "αγορά δωροκάρτας"',
  'site:.gr "δωροεπιταγή" αγορά',
  'site:.gr "κάρτα δώρου"',
  'site:.gr "Χάρισε" "gift card"',
  'site:.gr "δώρο" voucher',
  'site:.gr "gift card" "€"',
  'site:.gr "gift voucher" "€"',

  // URL/title patterns
  'site:.gr intitle:"gift card" shop',
  'site:.gr intitle:"δωροκάρτα" shop',
  'site:.gr inurl:gift-card "€"',
  'site:.gr inurl:giftcard "€"',
  'site:.gr inurl:egift "€"',
  'site:.gr inurl:dorokarta "€"',
  'site:.gr inurl:doroepitagi "€"',

  // Greece + global brands / local presence
  '"gift card" Greece spa',
  '"gift card" Greece restaurant',
  '"gift card" Greece hotel',
  '"gift card" Greece fashion',
  '"gift card" Greece jewelry',
  '"gift card" Greece beauty',
  '"gift card" Greece travel',
  '"gift card" Greece shop',
  '"digital gift card" Greece',
  '"e-gift card" Greece',
  '"gift voucher" Greece',
  '"δωροκάρτα" Ελλάδα shop',
  '"δωροκάρτα" Αθήνα',
  '"δωροκάρτα" Θεσσαλονίκη',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim()));
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

function domainFromUrl(raw: string) {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return getDomain(host, { allowPrivateDomains: true }) || host;
  } catch {
    return "";
  }
}

function blocked(domain: string) {
  return BLOCKED.some((b) => domain === b || domain.endsWith("." + b));
}

function giftSignal(text: string) {
  return /gift\s*-?\s*card|giftcard|e-?gift|δωροκάρ|δωροκαρ|δωροεπιταγ|gift voucher|gift certificate|voucher δώρου/i.test(
    text,
  );
}

function readBaselineDomains() {
  const out = new Set<string>();

  for (const file of BASELINE_FILES) {
    if (!fs.existsSync(file)) continue;

    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const matrix = parseCsv(raw);
    const headers = matrix.shift() || [];

    const domainIdx = headers.indexOf("domain");
    const listIdx = headers.indexOf("new_domain_list");

    for (const row of matrix) {
      if (domainIdx >= 0) {
        const d = (row[domainIdx] || "").trim().toLowerCase();
        if (d) out.add(d);
      }
      if (listIdx >= 0) {
        for (const d of (row[listIdx] || "")
          .split("|")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)) {
          out.add(d);
        }
      }
    }
  }

  return out;
}

async function search(q: string, page: number) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q,
      gl: "gr",
      hl: "el",
      num: 10,
      page,
    }),
  });

  const txt = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  return JSON.parse(txt);
}

async function main() {
  if (!API_KEY) {
    throw new Error("SERPER_API_KEY missing in .env");
  }

  console.log("Dorokartes Google Focused Wave 2 v4");
  console.log("===================================");
  console.log(`Budget: ${BUDGET} calls`);
  console.log(`Pages/query: ${PAGES}`);
  console.log(`Query pack: ${QUERY_PACK.length}`);
  console.log(`Max possible calls from pack: ${QUERY_PACK.length * PAGES}`);
  console.log("OpenAI calls: 0");
  console.log("");

  const baseline = readBaselineDomains();
  console.log(`Baseline domains already known: ${baseline.size}`);
  console.log("");

  const seenThisRun = new Set<string>();
  const hits: Record<string, unknown>[] = [];

  const domains = new Map<
    string,
    {
      domain: string;
      hits: number;
      queries: Set<string>;
      sampleUrl: string;
      sampleTitle: string;
    }
  >();

  const report: Record<string, unknown>[] = [];

  let calls = 0;
  let organicCount = 0;
  let errors = 0;

  outer:
  for (const q of QUERY_PACK) {
    let queryNew = 0;

    for (let page = 1; page <= PAGES; page++) {
      if (calls >= BUDGET) break outer;

      console.log(`[${calls + 1}/${BUDGET}] p${page} ${q}`);

      try {
        const data = await search(q, page);
        calls++;

        const organic = Array.isArray(data.organic) ? data.organic : [];
        organicCount += organic.length;

        const callNew = new Set<string>();

        for (let i = 0; i < organic.length; i++) {
          const r = organic[i] || {};
          const url = String(r.link || "").trim();
          const title = String(r.title || "").trim();
          const snippet = String(r.snippet || "").trim();

          const domain = domainFromUrl(url);
          if (!domain || blocked(domain)) continue;

          if (!giftSignal(`${title} ${snippet} ${url}`)) continue;

          hits.push({
            domain,
            url,
            title,
            snippet,
            query: q,
            page,
            position: i + 1,
          });

          if (!baseline.has(domain) && !seenThisRun.has(domain)) {
            callNew.add(domain);
            seenThisRun.add(domain);
          }

          if (!baseline.has(domain)) {
            let x = domains.get(domain);
            if (!x) {
              x = {
                domain,
                hits: 0,
                queries: new Set(),
                sampleUrl: url,
                sampleTitle: title,
              };
              domains.set(domain, x);
            }
            x.hits++;
            x.queries.add(q);
          }
        }

        queryNew += callNew.size;

        console.log(
          `  NEW=${callNew.size}` +
            (callNew.size ? ` -> ${[...callNew].join(", ")}` : ""),
        );
      } catch (e) {
        errors++;
        console.error("  ERROR", e instanceof Error ? e.message : e);

        if (/401|403|429|quota|credit|limit/i.test(String(e))) {
          break outer;
        }
      }

      await sleep(DELAY_MS);
    }

    report.push({
      query: q,
      pages_tested: PAGES,
      new_domains: queryNew,
    });
  }

  const domainRows = [...domains.values()]
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        b.queries.size - a.queries.size ||
        a.domain.localeCompare(b.domain),
    )
    .map((x) => ({
      domain: x.domain,
      hits: x.hits,
      query_count: x.queries.size,
      sample_title: x.sampleTitle,
      sample_url: x.sampleUrl,
      queries: [...x.queries].join(" | "),
    }));

  writeCsv(OUT_HITS, hits, [
    "domain",
    "url",
    "title",
    "snippet",
    "query",
    "page",
    "position",
  ]);

  writeCsv(OUT_DOMAINS, domainRows, [
    "domain",
    "hits",
    "query_count",
    "sample_title",
    "sample_url",
    "queries",
  ]);

  writeCsv(OUT_REPORT, report, [
    "query",
    "pages_tested",
    "new_domains",
  ]);

  const topQueries = [...report]
    .sort((a, b) => Number(b.new_domains) - Number(a.new_domains))
    .slice(0, 20);

  console.log("");
  console.log("=== TOP QUERIES THIS WAVE ===");
  for (const r of topQueries) {
    console.log(`NEW=${r.new_domains} | ${r.query}`);
  }

  console.log("");
  console.log("===================================");
  console.log(`Calls used: ${calls}`);
  console.log(`Organic results: ${organicCount}`);
  console.log(`Net-new gift-signal domains: ${domainRows.length}`);
  console.log(
    `Yield: ${calls ? (domainRows.length / calls).toFixed(2) : "0.00"} new domains/call`,
  );
  console.log(`Errors: ${errors}`);
  console.log(`Domains CSV: ${OUT_DOMAINS}`);
  console.log(`Hits CSV: ${OUT_HITS}`);
  console.log(`Report CSV: ${OUT_REPORT}`);
  console.log("OpenAI calls: 0");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
