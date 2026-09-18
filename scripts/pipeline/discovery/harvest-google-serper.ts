import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDomain } from "tldts";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "discovery", "google");
const RAW_DIR = path.join(OUT_DIR, "raw");
const HITS_OUT = path.join(OUT_DIR, "google-serper-hits-v1.csv");
const DOMAINS_OUT = path.join(OUT_DIR, "google-serper-domains-v1.csv");
const STATE_FILE = path.join(OUT_DIR, "google-serper-daily-state.json");

const API_KEY = process.env.SERPER_API_KEY || "";
const DAILY_CAP = Math.max(1, Number(process.env.GOOGLE_HARVEST_DAILY_CAP || "100"));
const RESULTS_PER_PAGE = Math.min(100, Math.max(10, Number(process.env.GOOGLE_HARVEST_RESULTS_PER_PAGE || "10")));
const PAGES_PER_QUERY = Math.max(1, Number(process.env.GOOGLE_HARVEST_PAGES_PER_QUERY || "5"));
const REQUEST_DELAY_MS = Math.max(150, Number(process.env.GOOGLE_HARVEST_DELAY_MS || "350"));

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const RESET_TODAY = args.has("--reset-today");

const BLOCKED_DOMAINS = [
  "google.com", "youtube.com", "facebook.com", "instagram.com", "linkedin.com",
  "tiktok.com", "pinterest.com", "x.com", "twitter.com", "wikipedia.org",
  "bestprice.gr", "skroutz.gr", "kouponia365.gr", "vrisko.gr", "xo.gr",
  "reddit.com", "tripadvisor.com", "booking.com", "amazon.com", "ebay.com"
];

const QUERY_PACKS = [
  // Generic Greek high-intent
  'site:.gr "δωροκάρτα"',
  'site:.gr "δωροκαρτα"',
  'site:.gr "gift card"',
  'site:.gr "giftcard"',
  'site:.gr "e-gift card"',
  'site:.gr "eGift Card"',
  'site:.gr "δωροεπιταγή"',
  'site:.gr "δωροεπιταγη"',
  'site:.gr "ηλεκτρονική δωροκάρτα"',
  'site:.gr "ψηφιακή δωροκάρτα"',
  '"δωροκάρτα" Ελλάδα online',
  '"gift card" Ελλάδα online',

  // Fashion / shoes / jewelry / beauty
  'site:.gr ρούχα "gift card"',
  'site:.gr μόδα "δωροκάρτα"',
  'site:.gr παπούτσια "gift card"',
  'site:.gr κοσμήματα "δωροκάρτα"',
  'site:.gr ρολόγια "gift card"',
  'site:.gr καλλυντικά "gift card"',
  'site:.gr ομορφιά "δωροκάρτα"',
  'site:.gr άρωμα "gift card"',

  // Home / tech / sports
  'site:.gr σπίτι "gift card"',
  'site:.gr έπιπλα "δωροκάρτα"',
  'site:.gr ηλεκτρονικά "gift card"',
  'site:.gr τεχνολογία "δωροκάρτα"',
  'site:.gr αθλητικά "gift card"',
  'site:.gr fitness "gift card"',

  // Food / hospitality / experiences
  'site:.gr εστιατόριο "gift card"',
  'site:.gr ξενοδοχείο "gift card"',
  'site:.gr spa "gift card"',
  'site:.gr massage "gift card"',
  'site:.gr εμπειρία "gift card"',
  'site:.gr ταξίδια "gift card"',
  'site:.gr αεροπορική "gift card"',
  'site:.gr καφέ "δωροκάρτα"',

  // Kids / books / flowers / pets
  'site:.gr παιδικά "gift card"',
  'site:.gr παιχνίδια "δωροκάρτα"',
  'site:.gr βιβλία "gift card"',
  'site:.gr βιβλιοπωλείο "δωροκάρτα"',
  'site:.gr λουλούδια "gift card"',
  'site:.gr ανθοπωλείο "δωροκάρτα"',
  'site:.gr κατοικίδια "gift card"',

  // Services / education / entertainment
  'site:.gr εκπαίδευση "gift card"',
  'site:.gr μαθήματα "gift card"',
  'site:.gr cinema "gift card"',
  'site:.gr θέατρο "δωροκάρτα"',
  'site:.gr gaming "gift card"',
  'site:.gr φωτογραφία "gift card"',
  'site:.gr κομμωτήριο "gift card"',
  'site:.gr nail "gift card"',

  // Alternate commercial language
  'site:.gr "αγόρασε δωροκάρτα"',
  'site:.gr "αγορά δωροκάρτας"',
  'site:.gr "αγορά gift card"',
  'site:.gr "στείλε δωροκάρτα"',
  'site:.gr "δώρο αξίας" "gift card"',
  'site:.gr "voucher δώρου"',
  'site:.gr "gift voucher"',
  'site:.gr "δωροκουπόνι"',
  'site:.gr "gift certificate"',
  'site:.gr "δώρο σε κάποιον" "κάρτα"',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayAthens() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type DailyState = {
  date: string;
  used: number;
  completedKeys: string[];
};

function loadState(): DailyState {
  const today = todayAthens();

  if (RESET_TODAY || !fs.existsSync(STATE_FILE)) {
    return { date: today, used: 0, completedKeys: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (parsed.date !== today) {
      return { date: today, used: 0, completedKeys: [] };
    }
    return {
      date: today,
      used: Number(parsed.used || 0),
      completedKeys: Array.isArray(parsed.completedKeys) ? parsed.completedKeys : [],
    };
  } catch {
    return { date: today, used: 0, completedKeys: [] };
  }
}

function saveState(state: DailyState) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
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

function loadExistingCsv(file: string): Record<string, string>[] {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() || [];
  return matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] || ""));
    return row;
  });
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function normalizeUrl(raw: string) {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref$|source$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function domainFromUrl(raw: string) {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return getDomain(host, { allowPrivateDomains: true }) || host;
  } catch {
    return "";
  }
}

function blockedDomain(domain: string) {
  return BLOCKED_DOMAINS.some((b) => domain === b || domain.endsWith("." + b));
}

function hasGiftSignal(text: string) {
  return /gift\s*-?\s*card|giftcard|e-?gift|δωροκάρ|δωροκαρ|δωροεπιταγ|gift voucher|gift certificate|voucher δώρου|δωροκουπ/i.test(text);
}

async function serperSearch(q: string, page: number) {
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
      num: RESULTS_PER_PAGE,
      page,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text);
}

async function main() {
  console.log("Dorokartes Google Harvester — Serper v1");
  console.log("=======================================");
  console.log(`Mode: ${APPLY ? "RUN" : "PLAN"}`);
  console.log(`Daily cap: ${DAILY_CAP} API searches`);
  console.log(`Pages/query: ${PAGES_PER_QUERY}`);
  console.log(`Results/page requested: ${RESULTS_PER_PAGE}`);
  console.log(`Query pack: ${QUERY_PACKS.length}`);
  console.log("OpenAI calls: 0");
  console.log("");

  const state = loadState();
  const remaining = Math.max(0, DAILY_CAP - state.used);

  console.log(`Athens date: ${state.date}`);
  console.log(`Already used today: ${state.used}`);
  console.log(`Remaining today: ${remaining}`);

  if (!APPLY) {
    const possible = Math.min(
      remaining,
      QUERY_PACKS.length * PAGES_PER_QUERY - state.completedKeys.length,
    );
    console.log(`Would execute now: up to ${possible}`);
    console.log("");
    console.log("PLAN ONLY. No API calls.");
    console.log("Run: npm run pipeline:harvest-google-serper -- --apply");
    return;
  }

  if (!API_KEY) {
    throw new Error(
      "SERPER_API_KEY is missing. Add SERPER_API_KEY=... to D:\\dorokartes\\.env",
    );
  }

  if (remaining <= 0) {
    console.log("Daily cap already reached. Nothing to do.");
    return;
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });

  const existingHits = loadExistingCsv(HITS_OUT);
  const hitMap = new Map(existingHits.map((r) => [r.url, r]));

  let callsThisRun = 0;
  let organicThisRun = 0;
  let newUrlsThisRun = 0;
  let errors = 0;

  outer:
  for (const q of QUERY_PACKS) {
    for (let page = 1; page <= PAGES_PER_QUERY; page++) {
      if (state.used >= DAILY_CAP) break outer;

      const key = crypto
        .createHash("sha1")
        .update(`${q}|${page}`)
        .digest("hex");

      if (state.completedKeys.includes(key)) continue;

      console.log(
        `[${state.used + 1}/${DAILY_CAP}] page=${page} ${q}`,
      );

      try {
        const data = await serperSearch(q, page);

        const rawName =
          `${state.date}-${String(state.used + 1).padStart(3, "0")}-${key.slice(0, 8)}.json`;
        fs.writeFileSync(
          path.join(RAW_DIR, rawName),
          JSON.stringify({ query: q, page, response: data }, null, 2),
          "utf8",
        );

        const organic = Array.isArray(data.organic) ? data.organic : [];
        organicThisRun += organic.length;

        for (let pos = 0; pos < organic.length; pos++) {
          const item = organic[pos] || {};
          const rawUrl = String(item.link || "").trim();
          if (!rawUrl) continue;

          const url = normalizeUrl(rawUrl);
          const domain = domainFromUrl(url);
          if (!domain || blockedDomain(domain)) continue;

          const title = String(item.title || "").trim();
          const snippet = String(item.snippet || "").trim();
          const giftSignal = hasGiftSignal(`${title} ${snippet} ${url}`) ? "YES" : "NO";

          if (!hitMap.has(url)) {
            newUrlsThisRun++;
            hitMap.set(url, {
              url,
              domain,
              title,
              snippet,
              query: q,
              page: String(page),
              position: String(pos + 1),
              gift_signal: giftSignal,
              first_seen: new Date().toISOString(),
            });
          }
        }

        state.used++;
        callsThisRun++;
        state.completedKeys.push(key);
        saveState(state);
      } catch (error) {
        errors++;
        console.error("  ERROR:", error instanceof Error ? error.message : error);

        // Do not burn the local daily counter on a failed request.
        // Stop on auth/quota-like errors rather than hammering the endpoint.
        const msg = String(error);
        if (/401|403|429|quota|credit|limit/i.test(msg)) {
          console.error("Stopping because provider auth/quota/rate limit was detected.");
          break outer;
        }
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  const hits = [...hitMap.values()];
  writeCsv(HITS_OUT, hits, [
    "url",
    "domain",
    "title",
    "snippet",
    "query",
    "page",
    "position",
    "gift_signal",
    "first_seen",
  ]);

  const domainMap = new Map<string, {
    domain: string;
    hits: number;
    giftHits: number;
    sampleUrl: string;
    sampleTitle: string;
    queries: Set<string>;
  }>();

  for (const h of hits) {
    const domain = String(h.domain || "");
    if (!domain) continue;

    let x = domainMap.get(domain);
    if (!x) {
      x = {
        domain,
        hits: 0,
        giftHits: 0,
        sampleUrl: String(h.url || ""),
        sampleTitle: String(h.title || ""),
        queries: new Set(),
      };
      domainMap.set(domain, x);
    }

    x.hits++;
    if (h.gift_signal === "YES") x.giftHits++;
    if (h.query) x.queries.add(h.query);
  }

  const domains = [...domainMap.values()]
    .sort((a, b) => b.giftHits - a.giftHits || b.hits - a.hits || a.domain.localeCompare(b.domain))
    .map((x) => ({
      domain: x.domain,
      hits: x.hits,
      gift_hits: x.giftHits,
      query_count: x.queries.size,
      sample_title: x.sampleTitle,
      sample_url: x.sampleUrl,
      queries: [...x.queries].join(" | "),
    }));

  writeCsv(DOMAINS_OUT, domains, [
    "domain",
    "hits",
    "gift_hits",
    "query_count",
    "sample_title",
    "sample_url",
    "queries",
  ]);

  console.log("");
  console.log("=======================================");
  console.log(`API searches this run: ${callsThisRun}`);
  console.log(`Daily used: ${state.used}/${DAILY_CAP}`);
  console.log(`Organic results this run: ${organicThisRun}`);
  console.log(`New unique URLs this run: ${newUrlsThisRun}`);
  console.log(`Total unique URLs stored: ${hits.length}`);
  console.log(`Total unique candidate domains: ${domains.length}`);
  console.log(`Domains with explicit gift signal: ${domains.filter((d) => d.gift_hits > 0).length}`);
  console.log(`Errors: ${errors}`);
  console.log(`Hits CSV: ${HITS_OUT}`);
  console.log(`Domains CSV: ${DOMAINS_OUT}`);
  console.log("OpenAI calls: 0");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
