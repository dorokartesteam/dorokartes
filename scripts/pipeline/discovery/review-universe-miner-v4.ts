import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v1", "still-review.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v4");

const AUTO_SAFE = path.join(OUT_DIR, "auto-safe.csv");
const MANUAL_HIGH = path.join(OUT_DIR, "manual-high.csv");
const STILL_REVIEW = path.join(OUT_DIR, "still-review.csv");
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
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

const GIFT_RX = [
  /gift\s*card/i,
  /giftcard/i,
  /gift\s*voucher/i,
  /gift\s*certificate/i,
  /e-?gift/i,
  /δωροκάρτ/i,
  /δωροεπιταγ/i,
  /κάρτα\s*δώρου/i,
  /voucher/i,
];

const URL_GIFT_RX = /gift[-_/]?card|gift[-_/]?voucher|gift[-_/]?certificate|dorokart|dwrokart|δωροκαρ|δωροεπιταγ|voucher/i;

const BAD_DOMAIN_RX = [
  /^blog\./i,
  /^support\./i,
  /^help\./i,
  /^forum\./i,
  /^news\./i,
  /^staging\./i,
  /^demo\./i,
  /^dev\./i,
  /^test\./i,
  /^mail\./i,
  /^css\./i,
];

const BAD_TEXT_RX = [
  /market research/i,
  /market size/i,
  /industry report/i,
  /comparison shopping/i,
  /gift card reseller/i,
  /buy discounted gift cards/i,
  /gift card exchange/i,
  /gift card marketplace/i,
  /gift card software/i,
  /gift card platform/i,
  /gift card printing/i,
  /template/i,
  /mockup/i,
  /coupon/i,
  /promo code/i,
  /forum/i,
  /contest/i,
  /giveaway/i,
  /terms and conditions/i,
  /how to/i,
  /guide/i,
  /news/i,
];

function scoreRow(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase();
  const title = String(row.title || "");
  const merchant = String(row.merchant_name || "");
  const snippet = String(row.snippet || "");
  const url = String(row.possible_official_url || "");
  const occurrences = Number(row.occurrences || 1) || 1;
  const text = `${merchant} ${title} ${snippet}`;
  let score = 0;
  const reasons: string[] = [];

  if (BAD_DOMAIN_RX.some((rx) => rx.test(domain))) {
    return { bucket: "REJECT", score: -100, reason: "bad_subdomain" };
  }

  if (BAD_TEXT_RX.some((rx) => rx.test(text))) {
    return { bucket: "REJECT", score: -80, reason: "editorial_reseller_platform_signal" };
  }

  if (isGreekTld(domain)) {
    score += 35;
    reasons.push("greek_tld");
  }

  if (GIFT_RX.some((rx) => rx.test(title))) {
    score += 35;
    reasons.push("gift_title");
  }

  if (URL_GIFT_RX.test(url)) {
    score += 30;
    reasons.push("gift_url");
  }

  if (GIFT_RX.some((rx) => rx.test(snippet))) {
    score += 15;
    reasons.push("gift_snippet");
  }

  if (occurrences >= 2) {
    score += 10;
    reasons.push("repeated_source");
  }

  if (occurrences >= 3) {
    score += 5;
    reasons.push("multi_source");
  }

  if (domain && merchant) {
    const label = domain.split(".")[0].replace(/[-_]/g, "").toLowerCase();
    const normMerchant = merchant.toLowerCase().replace(/[^a-z0-9α-ω]/gi, "");
    if (label.length >= 4 && normMerchant.includes(label)) {
      score += 10;
      reasons.push("brand_domain_match");
    }
  }

  if (score >= 80 && isGreekTld(domain) && (URL_GIFT_RX.test(url) || GIFT_RX.some((rx) => rx.test(title)))) {
    return { bucket: "AUTO_SAFE", score, reason: reasons.join("|") };
  }

  if (score >= 55) {
    return { bucket: "MANUAL_HIGH", score, reason: reasons.join("|") };
  }

  return { bucket: "STILL_REVIEW", score, reason: reasons.join("|") || "weak_signal" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));

const autoSafe: any[] = [];
const manualHigh: any[] = [];
const stillReview: any[] = [];
const reject: any[] = [];

for (const row of rows) {
  const c = scoreRow(row);
  const out = {
    ...row,
    v4_score: c.score,
    v4_bucket: c.bucket,
    v4_reason: c.reason,
  };

  if (c.bucket === "AUTO_SAFE") autoSafe.push(out);
  else if (c.bucket === "MANUAL_HIGH") manualHigh.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else stillReview.push(out);
}

autoSafe.sort((a,b) => Number(b.v4_score) - Number(a.v4_score));
manualHigh.sort((a,b) => Number(b.v4_score) - Number(a.v4_score));
stillReview.sort((a,b) => Number(b.v4_score) - Number(a.v4_score));

const headers = [
  "score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v4_score","v4_bucket","v4_reason"
];

writeCsv(AUTO_SAFE, autoSafe, headers);
writeCsv(MANUAL_HIGH, manualHigh, headers);
writeCsv(STILL_REVIEW, stillReview, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_still_review: rows.length,
  auto_safe: autoSafe.length,
  manual_high: manualHigh.length,
  still_review: stillReview.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v4");
console.log("===================================");
console.log(`Input STILL_REVIEW: ${rows.length}`);
console.log(`AUTO_SAFE: ${autoSafe.length}`);
console.log(`MANUAL_HIGH: ${manualHigh.length}`);
console.log(`STILL_REVIEW: ${stillReview.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`AUTO SAFE CSV: ${AUTO_SAFE}`);
console.log(`MANUAL HIGH CSV: ${MANUAL_HIGH}`);
console.log(`STILL REVIEW CSV: ${STILL_REVIEW}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
