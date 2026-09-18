import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v4", "manual-high.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v5");

const AUTO_GREECE = path.join(OUT_DIR, "auto-greece-relevant.csv");
const GLOBAL_GREECE = path.join(OUT_DIR, "global-greece-review.csv");
const MANUAL = path.join(OUT_DIR, "manual-review.csv");
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

function esc(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function isGreekTld(domain: string) {
  return domain.endsWith(".gr") || domain.endsWith(".com.gr") || domain.endsWith(".net.gr") || domain.endsWith(".org.gr");
}

const GREECE_SIGNAL = [
  /\bgreece\b/i, /\bgreek\b/i, /\bathens\b/i, /\bthessaloniki\b/i,
  /\bmykonos\b/i, /\bsantorini\b/i, /\bcrete\b/i, /\bcorfu\b/i,
  /\brhodes\b/i, /\bkalamata\b/i, /\blefkada\b/i, /\bchania\b/i,
  /\bioannina\b/i, /\bpatras\b/i, /\bheraklion\b/i,
  /ελλάδ/i, /αθήν/i, /θεσσαλονίκ/i, /μύκονο/i, /σαντορίν/i,
  /κρήτ/i, /ρόδ/i, /χάνι/i, /καλαμάτ/i
];

const DIRECT_GIFT = [
  /gift\s*card/i, /gift\s*voucher/i, /gift\s*certificate/i, /e-?gift/i,
  /δωροκάρτ/i, /δωροεπιταγ/i, /κάρτα\s*δώρου/i, /voucher/i
];

const BAD_DOMAIN_RX = [
  /^support\./i, /^help\./i, /^faq\./i, /^news\./i, /^blog\./i,
  /^forum\./i, /^staging\./i, /^demo\./i, /^dev\./i, /^test\./i
];

const BAD_TEXT_RX = [
  /market research/i, /market size/i, /industry report/i, /business intelligence/i,
  /gift card manufacturers/i, /gift card provider/i, /gift card software/i,
  /gift card platform/i, /gift card marketplace/i, /buy .* gift cards with crypto/i,
  /gift card exchange/i, /discount gift cards/i, /best gift cards/i,
  /top \d+ gift cards/i, /news/i, /press release/i, /forum/i, /tripadvisor/i,
  /template/i, /mockup/i, /printing/i, /coupon/i, /promo code/i
];

const RESELLER_DOMAINS = new Set([
  "coinsbee.com", "driffle.com", "dundle.com", "egifter.com", "gameseal.com",
  "giftly.com", "giftoff.com", "gogift.com", "joyogram.com", "k4g.com",
  "giftvouchers.co.uk", "lifestylegiftcards.co.uk", "tripadvisor.co.za",
  "databridgemarketresearch.com", "finance.yahoo.com", "globenewswire.com",
  "ensun.io", "eqs-news.com", "ferry-guide.com"
]);

const GLOBAL_BRANDS = [
  /decathlon/i, /\bnext\b/i, /air serbia/i, /boots/i, /coco-?mat/i,
  /fairmont/i, /gucci/i, /hilton/i, /hotels\.com/i, /intimissimi/i,
  /intrepid travel/i, /juventus/i, /accor/i, /four seasons/i
];

function classify(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase().replace(/^www\./, "");
  const title = String(row.title || "");
  const merchant = String(row.merchant_name || "");
  const snippet = String(row.snippet || "");
  const url = String(row.possible_official_url || "");
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (!domain || !url) return { bucket: "REJECT", reason: "missing_domain_or_url" };
  if (BAD_DOMAIN_RX.some((rx) => rx.test(domain))) return { bucket: "REJECT", reason: "support_news_blog_or_dev_subdomain" };
  if (RESELLER_DOMAINS.has(domain)) return { bucket: "REJECT", reason: "known_reseller_marketplace_or_news" };
  if (BAD_TEXT_RX.some((rx) => rx.test(text))) return { bucket: "REJECT", reason: "research_reseller_editorial_signal" };

  const gift = DIRECT_GIFT.some((rx) => rx.test(text));
  const greece = GREECE_SIGNAL.some((rx) => rx.test(text));

  if (!gift) return { bucket: "MANUAL_REVIEW", reason: "weak_gift_signal" };

  if (isGreekTld(domain)) {
    return { bucket: "AUTO_GREECE_RELEVANT", reason: "greek_tld_and_direct_gift_signal" };
  }

  if (greece) {
    return { bucket: "AUTO_GREECE_RELEVANT", reason: "non_gr_domain_with_clear_greece_signal" };
  }

  if (GLOBAL_BRANDS.some((rx) => rx.test(text))) {
    return { bucket: "GLOBAL_GREECE_REVIEW", reason: "recognized_global_brand_possible_greece_relevance" };
  }

  return { bucket: "MANUAL_REVIEW", reason: "foreign_or_market_relevance_unclear" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));
const autoGreece: any[] = [];
const globalGreece: any[] = [];
const manual: any[] = [];
const reject: any[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = { ...row, v5_bucket: c.bucket, v5_reason: c.reason };
  if (c.bucket === "AUTO_GREECE_RELEVANT") autoGreece.push(out);
  else if (c.bucket === "GLOBAL_GREECE_REVIEW") globalGreece.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manual.push(out);
}

const headers = [
  "v4_score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v4_bucket","v4_reason","v5_bucket","v5_reason"
];

writeCsv(AUTO_GREECE, autoGreece, headers);
writeCsv(GLOBAL_GREECE, globalGreece, headers);
writeCsv(MANUAL, manual, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_manual_high_v4: rows.length,
  auto_greece_relevant: autoGreece.length,
  global_greece_review: globalGreece.length,
  manual_review: manual.length,
  reject: reject.length
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v5");
console.log("===================================");
console.log(`Input MANUAL_HIGH v4: ${rows.length}`);
console.log(`AUTO_GREECE_RELEVANT: ${autoGreece.length}`);
console.log(`GLOBAL_GREECE_REVIEW: ${globalGreece.length}`);
console.log(`MANUAL_REVIEW: ${manual.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`AUTO GREECE CSV: ${AUTO_GREECE}`);
console.log(`GLOBAL GREECE CSV: ${GLOBAL_GREECE}`);
console.log(`MANUAL CSV: ${MANUAL}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
