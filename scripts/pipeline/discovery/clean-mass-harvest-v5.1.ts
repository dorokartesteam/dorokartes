import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "candidates.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "clean-v5.1");
const SAFE = path.join(OUT_DIR, "high-safe.csv");
const REVIEW = path.join(OUT_DIR, "review.csv");
const REJECT = path.join(OUT_DIR, "reject.csv");
const SUMMARY = path.join(OUT_DIR, "summary.json");

if (!fs.existsSync(IN)) {
  throw new Error(`Missing input CSV: ${IN}`);
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
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

function domainFromUrl(raw: string) {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const HARD_REJECT_DOMAINS = new Set([
  "1minutepay.com",
  "2gosoftware.eu",
  "aceb.com",
  "alliedmarketresearch.com",
  "apps.apple.com",
  "asdagiftcards.com",
  "aura-print.com",
  "baxity.com",
  "becharge.be",
  "bitmama.io",
  "bitrefill.com",
  "blackhawknetwork.com",
  "buysellvouchers.com",
  "cardfly.net",
  "cardtonic.com",
  "giftcardstore.co.uk",
]);

const HARD_REJECT_HOST_PATTERNS = [
  /^blog\./i,
  /^business\./i,
];

const HARD_REJECT_TEXT = [
  /market size/i,
  /market share/i,
  /market intelligence/i,
  /market research/i,
  /analysis\b/i,
  /types of gift cards/i,
  /most popular gift cards/i,
  /top \d+ .*gift cards/i,
  /buy .* gift card with crypto/i,
  /buy .* gift cards .* bitcoin/i,
  /buy .* gift cards .* crypto/i,
  /instant delivery/i,
  /prepaid gift card online/i,
  /gift card printing/i,
  /custom gift card boxes/i,
  /gift card reseller/i,
  /gift cards? for .* brands/i,
  /100\+ .*brands/i,
  /gift card store/i,
  /promo code/i,
  /coupon/i,
];

const REVIEW_TEXT = [
  /prepaid/i,
  /voucher products/i,
  /special gift cards/i,
  /gift cards? in .* with/i,
];

const OFFICIAL_POSITIVE = [
  /gift card/i,
  /gift cards/i,
  /e-?gift card/i,
  /gift voucher/i,
  /gift vouchers/i,
  /δωροκάρτα/i,
  /δωροκάρτες/i,
  /δωροεπιταγή/i,
  /δωροεπιταγές/i,
];

const COMMERCIAL_POSITIVE = [
  /buy/i,
  /shop/i,
  /store/i,
  /online/i,
  /αγορά/i,
  /€|eur|£|\$/i,
];

function classify(row: Record<string, string>) {
  const score = Number(row.score || "0");
  const url = row.possible_official_url || "";
  const domain = (row.domain || domainFromUrl(url)).toLowerCase();
  const title = row.title || "";
  const snippet = row.snippet || "";
  const merchant = row.merchant_name || "";
  const text = `${title} ${snippet} ${merchant} ${url}`;

  if (score < 90) {
    return { bucket: "REVIEW", reason: "score_below_90" };
  }

  if (HARD_REJECT_DOMAINS.has(domain)) {
    return { bucket: "REJECT", reason: "known_reseller_aggregator_or_research_domain" };
  }

  if (HARD_REJECT_HOST_PATTERNS.some((p) => p.test(domain))) {
    return { bucket: "REJECT", reason: "blog_or_business_subdomain" };
  }

  if (HARD_REJECT_TEXT.some((p) => p.test(text))) {
    return { bucket: "REJECT", reason: "reseller_research_editorial_or_packaging_signal" };
  }

  if (REVIEW_TEXT.some((p) => p.test(text))) {
    return { bucket: "REVIEW", reason: "ambiguous_reseller_or_prepaid_signal" };
  }

  const officialSignals = OFFICIAL_POSITIVE.filter((p) => p.test(text)).length;
  const commercialSignals = COMMERCIAL_POSITIVE.filter((p) => p.test(text)).length;

  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
  })();

  const pathLooksCardSpecific =
    /gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ/i.test(path);

  if (officialSignals >= 1 && (pathLooksCardSpecific || commercialSignals >= 1)) {
    return { bucket: "HIGH_SAFE", reason: "merchant_owned_gift_card_signal" };
  }

  return { bucket: "REVIEW", reason: "gift_signal_but_not_strong_enough" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));

const highSafe: Record<string, unknown>[] = [];
const review: Record<string, unknown>[] = [];
const reject: Record<string, unknown>[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = {
    ...row,
    clean_bucket: c.bucket,
    clean_reason: c.reason,
  };

  if (c.bucket === "HIGH_SAFE") highSafe.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else review.push(out);
}

const headers = [
  "score",
  "domain",
  "merchant_name",
  "possible_official_url",
  "title",
  "snippet",
  "query",
  "clean_bucket",
  "clean_reason",
];

writeCsv(SAFE, highSafe, headers);
writeCsv(REVIEW, review, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_rows: rows.length,
  high_safe: highSafe.length,
  review: review.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Mass Harvest Cleaner v5.1");
console.log("====================================");
console.log(`Input rows: ${rows.length}`);
console.log(`HIGH_SAFE: ${highSafe.length}`);
console.log(`REVIEW: ${review.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`HIGH_SAFE CSV: ${SAFE}`);
console.log(`REVIEW CSV: ${REVIEW}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("No database changes were made.");
