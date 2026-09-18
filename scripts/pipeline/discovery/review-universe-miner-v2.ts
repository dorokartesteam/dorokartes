import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v1", "second-pass-safe.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v2");

const GREEK_SAFE = path.join(OUT_DIR, "greek-safe.csv");
const GLOBAL_BRAND_REVIEW = path.join(OUT_DIR, "global-brand-review.csv");
const MANUAL_REVIEW = path.join(OUT_DIR, "manual-review.csv");
const REJECT = path.join(OUT_DIR, "reject.csv");
const SUMMARY = path.join(OUT_DIR, "summary.json");

if (!fs.existsSync(IN)) throw new Error(`Missing input CSV: ${IN}`);

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i] ?? ""]));
  });
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

function isGreekDomain(domain: string) {
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

const HARD_REJECT_DOMAINS = new Set([
  "carddepot.com",
  "coingate.com",
  "diggecard.com",
  "epay.de",
  "europe.giftpay.com",
  "gamecardsdirect.com",
  "css.lighthouse.gr",
  "bestofdeals.gr",
  "corporate.wolt.com",
]);

const BAD_HOST_PATTERNS = [
  /^booking\./i,
  /^corporate\./i,
  /^css\./i,
  /^foratravel\.hoteltreats\.com$/i,
];

const BAD_TEXT = [
  /comparison shopping/i,
  /gift card hub/i,
  /gift card solution/i,
  /one-stop gift card shop/i,
  /discount gift cards/i,
  /gift cards europe/i,
  /market research/i,
  /market size/i,
  /tax-free gift cards/i,
  /results matching your search criteria/i,
  /online booking/i,
  /corporate travel/i,
];

const GREECE_SIGNAL = [
  /\bgreece\b/i,
  /\bgreek\b/i,
  /\bathens\b/i,
  /\bthessaloniki\b/i,
  /\bcorfu\b/i,
  /\bcrete\b/i,
  /\bsantorini\b/i,
  /\bmykonos\b/i,
  /\brhodes\b/i,
  /ελλάδ/i,
  /αθήν/i,
  /θεσσαλονίκ/i,
];

const BIG_GLOBAL_BRANDS = [
  /accor/i,
  /austrian airlines/i,
  /barcel[oó]/i,
  /bershka/i,
  /celebrity cruises/i,
  /charles\s*&?\s*keith/i,
  /contiki/i,
  /four seasons/i,
  /caudalie/i,
  /ekoi/i,
  /assos/i,
  /brown thomas/i,
  /bilderberg/i,
  /frederic malle/i,
];

function classify(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase();
  const title = String(row.title || "");
  const merchant = String(row.merchant_name || "");
  const snippet = String(row.snippet || "");
  const url = String(row.possible_official_url || "");
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (HARD_REJECT_DOMAINS.has(domain)) {
    return { bucket: "REJECT", reason: "known_aggregator_reseller_or_platform" };
  }

  if (BAD_HOST_PATTERNS.some((rx) => rx.test(domain))) {
    return { bucket: "REJECT", reason: "booking_comparison_corporate_or_platform_host" };
  }

  if (BAD_TEXT.some((rx) => rx.test(text))) {
    return { bucket: "REJECT", reason: "non_merchant_or_aggregator_signal" };
  }

  if (isGreekDomain(domain)) {
    return { bucket: "GREEK_SAFE", reason: "greek_domain_second_pass_safe" };
  }

  if (GREECE_SIGNAL.some((rx) => rx.test(text))) {
    return { bucket: "GREEK_SAFE", reason: "non_gr_domain_with_clear_greece_signal" };
  }

  if (BIG_GLOBAL_BRANDS.some((rx) => rx.test(text))) {
    return { bucket: "GLOBAL_BRAND_REVIEW", reason: "recognized_global_brand" };
  }

  return { bucket: "MANUAL_REVIEW", reason: "foreign_or_unclear_market_relevance" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));

const greekSafe: Record<string,unknown>[] = [];
const globalReview: Record<string,unknown>[] = [];
const manualReview: Record<string,unknown>[] = [];
const reject: Record<string,unknown>[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = {
    ...row,
    v2_bucket: c.bucket,
    v2_reason: c.reason,
  };

  if (c.bucket === "GREEK_SAFE") greekSafe.push(out);
  else if (c.bucket === "GLOBAL_BRAND_REVIEW") globalReview.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manualReview.push(out);
}

const headers = [
  "score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v2_bucket","v2_reason"
];

writeCsv(GREEK_SAFE, greekSafe, headers);
writeCsv(GLOBAL_BRAND_REVIEW, globalReview, headers);
writeCsv(MANUAL_REVIEW, manualReview, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_second_pass_safe: rows.length,
  greek_safe: greekSafe.length,
  global_brand_review: globalReview.length,
  manual_review: manualReview.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v2");
console.log("===================================");
console.log(`Input SECOND_PASS_SAFE: ${rows.length}`);
console.log(`GREEK_SAFE: ${greekSafe.length}`);
console.log(`GLOBAL_BRAND_REVIEW: ${globalReview.length}`);
console.log(`MANUAL_REVIEW: ${manualReview.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`Greek-safe CSV: ${GREEK_SAFE}`);
console.log(`Global-brand review CSV: ${GLOBAL_BRAND_REVIEW}`);
console.log(`Manual-review CSV: ${MANUAL_REVIEW}`);
console.log(`Reject CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
