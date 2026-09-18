import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "candidates.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "clean-v5.2");

const GREECE_SAFE = path.join(OUT_DIR, "greece-high-safe.csv");
const GLOBAL_REVIEW = path.join(OUT_DIR, "global-review.csv");
const MANUAL_REVIEW = path.join(OUT_DIR, "manual-review.csv");
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
      } else {
        cur += ch;
      }
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

function isGreekDomain(domain: string) {
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

function isGreekRelevant(text: string, url: string, domain: string) {
  if (isGreekDomain(domain)) return true;

  const t = `${text} ${url}`.toLowerCase();

  return (
    /\bgreece\b|\bgreek\b|\bhellas\b|\bathens\b|\bthessaloniki\b|\bcrete\b|\bcorfu\b|\bsantorini\b|\bmykonos\b|\brhodes\b|\bchania\b|\bheraklion\b|\bkos\b|\bpatras\b|\blarissa\b|\bvolos\b|\bioannina\b|\bkalamata\b/.test(t) ||
    /\/gr(?:\/|$)|\/el(?:\/|$)|[?&](country|locale|lang)=gr\b/.test(t) ||
    /ελλάδ|ελλην|αθήν|θεσσαλονίκ|κρήτ|ρόδ|κέρκυρ|σαντορίν|μύκον|χαλκιδικ/i.test(t)
  );
}

const HARD_REJECT_DOMAINS = new Set([
  "1minutepay.com",
  "2gosoftware.eu",
  "aceb.com",
  "alliedmarketresearch.com",
  "apps.apple.com",
  "asdagiftcards.com",
  "baxity.com",
  "becharge.be",
  "bitmama.io",
  "bitrefill.com",
  "blackhawknetwork.com",
  "businessinsider.com",
  "businesswire.com",
  "buysellvouchers.com",
  "cardfly.net",
  "cardtonic.com",
  "coincards.com",
  "colnect.com",
  "talk-home.com",
]);

const HARD_REJECT_HOST_PATTERNS = [
  /^blog\./i,
  /^business\./i,
  /^app\.talk-home\.com$/i,
];

const HARD_REJECT_TEXT = [
  /market size/i,
  /market share/i,
  /market intelligence/i,
  /market research/i,
  /industry report/i,
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
  /100\+ .*brands/i,
  /global hotel card/i,
  /electronic delivery/i,
  /gift cards? \[theme:/i,
  /promo code/i,
  /coupon/i,
];

const GIFT_SIGNAL = [
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

const OWN_BRAND_BAD = [
  /sephora .* gift card/i,
  /douglas .* gift card/i,
  /mango .* gift card/i,
  /netflix .* gift card/i,
  /apple .* gift card/i,
  /steam .* gift card/i,
  /playstation .* gift card/i,
  /xbox .* gift card/i,
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
    return { bucket: "MANUAL_REVIEW", reason: "score_below_90" };
  }

  if (HARD_REJECT_DOMAINS.has(domain)) {
    return { bucket: "REJECT", reason: "known_reseller_editorial_or_research_domain" };
  }

  if (HARD_REJECT_HOST_PATTERNS.some((p) => p.test(domain))) {
    return { bucket: "REJECT", reason: "blog_or_reseller_subdomain" };
  }

  if (HARD_REJECT_TEXT.some((p) => p.test(text))) {
    return { bucket: "REJECT", reason: "reseller_editorial_research_or_packaging_signal" };
  }

  // If the page title sells another famous brand's gift card, it is probably a reseller.
  if (OWN_BRAND_BAD.some((p) => p.test(text)) && !domain.includes("netflix") && !domain.includes("mango") && !domain.includes("sephora") && !domain.includes("douglas")) {
    return { bucket: "REJECT", reason: "third_party_brand_gift_card_reseller_signal" };
  }

  const hasGift = GIFT_SIGNAL.some((p) => p.test(text));
  if (!hasGift) {
    return { bucket: "MANUAL_REVIEW", reason: "weak_gift_card_signal" };
  }

  if (isGreekRelevant(text, url, domain)) {
    return { bucket: "GREECE_HIGH_SAFE", reason: "merchant_owned_gift_card_with_greece_relevance" };
  }

  return { bucket: "GLOBAL_REVIEW", reason: "appears_official_but_no_greece_relevance" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));

const greeceSafe: Record<string, unknown>[] = [];
const globalReview: Record<string, unknown>[] = [];
const manualReview: Record<string, unknown>[] = [];
const reject: Record<string, unknown>[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = {
    ...row,
    clean_bucket: c.bucket,
    clean_reason: c.reason,
  };

  if (c.bucket === "GREECE_HIGH_SAFE") greeceSafe.push(out);
  else if (c.bucket === "GLOBAL_REVIEW") globalReview.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manualReview.push(out);
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

writeCsv(GREECE_SAFE, greeceSafe, headers);
writeCsv(GLOBAL_REVIEW, globalReview, headers);
writeCsv(MANUAL_REVIEW, manualReview, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_rows: rows.length,
  greece_high_safe: greeceSafe.length,
  global_review: globalReview.length,
  manual_review: manualReview.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Mass Harvest Cleaner v5.2");
console.log("====================================");
console.log(`Input rows: ${rows.length}`);
console.log(`GREECE_HIGH_SAFE: ${greeceSafe.length}`);
console.log(`GLOBAL_REVIEW: ${globalReview.length}`);
console.log(`MANUAL_REVIEW: ${manualReview.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`Greece-safe CSV: ${GREECE_SAFE}`);
console.log(`Global-review CSV: ${GLOBAL_REVIEW}`);
console.log(`Manual-review CSV: ${MANUAL_REVIEW}`);
console.log(`Reject CSV: ${REJECT}`);
console.log("");
console.log("No database changes were made.");
