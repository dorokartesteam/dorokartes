import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "candidates.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "clean-v5.4");

const AUTO_SAFE = path.join(OUT_DIR, "auto-safe-owned-brand.csv");
const REVIEW = path.join(OUT_DIR, "review.csv");
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
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function registrableLabel(domain: string) {
  const d = domain.replace(/^www\./, "");
  const parts = d.split(".");
  if (parts.length >= 3 && parts.slice(-2).join(".") === "com.gr") return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "";
}

function normalize(s: string) {
  return (s || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreekDomain(domain: string) {
  return domain.endsWith(".gr") || domain.endsWith(".com.gr") || domain.endsWith(".net.gr") || domain.endsWith(".org.gr");
}

const HARD_REJECT_DOMAINS = new Set([
  "desertcart.gr","easytechnology.gr","fnet.gr","lifo.gr","freelancer.gr",
  "futuresoft.gr","g2a.com","eneba.com","etsy.com","egiftcards.nz",
  "giftcards.bidali.com","coincards.com","colnect.com","doctorsim.com",
  "fleximart.ae","businessinsider.com","businesswire.com","bitrefill.com",
  "buysellvouchers.com","cardfly.net","cardtonic.com","2gosoftware.eu",
  "1minutepay.com","aceb.com","alliedmarketresearch.com","apps.apple.com",
  "asdagiftcards.com","baxity.com","becharge.be","bitmama.io","blackhawknetwork.com"
]);

const EDITORIAL_DOMAINS = [
  /^blog\./i,
  /^demo\./i,
  /^business\./i,
  /^app\./i,
];

const THIRD_PARTY_BRAND_SIGNALS = [
  /\bsteam\b.*gift card/i,
  /\bxbox\b.*gift card/i,
  /\bplaystation\b.*gift card/i,
  /\bpsn\b.*gift card/i,
  /\bamazon\b.*gift card/i,
  /\bgoogle play\b.*gift card/i,
  /\bapple\b.*gift card/i,
  /\bnetflix\b.*gift card/i,
  /\bspotify\b.*gift card/i,
  /\bplaisio\b.*gift card/i,
  /\bskroutz\b.*gift card/i,
  /\bsephora\b.*gift card/i,
  /\bdouglas\b.*gift card/i,
  /\bikea\b.*gift card/i,
  /\bhp\b.*gift card/i,
  /\brazer\b.*gift card/i,
];

const NON_MERCHANT_SIGNALS = [
  /software solution/i,
  /portfolio/i,
  /creation of a gift voucher/i,
  /market research/i,
  /market size/i,
  /market share/i,
  /analysis\b/i,
  /gift card printing/i,
  /custom gift card boxes/i,
  /voucher printing/i,
  /giveaway/i,
  /win a .*gift voucher/i,
  /tagged with.*gift card/i,
  /products with tag.*gift card/i,
];

const GIFT_SIGNAL = [
  /gift card/i,/gift cards/i,/e-?gift card/i,/gift voucher/i,/gift vouchers/i,
  /δωροκάρτα/i,/δωροκάρτες/i,/δωροεπιταγή/i,/δωροεπιταγές/i
];

function titleOwnsBrand(domain: string, merchant: string, title: string) {
  const label = normalize(registrableLabel(domain)).replace(/\s/g, "");
  const text = normalize(`${merchant} ${title}`).replace(/\s/g, "");
  if (!label || label.length < 3) return false;
  return text.includes(label);
}

function classify(row: Record<string, string>) {
  const score = Number(row.score || "0");
  const url = row.possible_official_url || "";
  const domain = (row.domain || domainFromUrl(url)).toLowerCase();
  const merchant = row.merchant_name || "";
  const title = row.title || "";
  const snippet = row.snippet || "";
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (score < 90) return { bucket: "REVIEW", reason: "score_below_90" };

  if (HARD_REJECT_DOMAINS.has(domain)) {
    return { bucket: "REJECT", reason: "known_reseller_editorial_marketplace_or_false_positive" };
  }

  if (EDITORIAL_DOMAINS.some((p) => p.test(domain))) {
    return { bucket: "REJECT", reason: "editorial_demo_or_app_subdomain" };
  }

  if (NON_MERCHANT_SIGNALS.some((p) => p.test(text))) {
    return { bucket: "REJECT", reason: "non_merchant_page_signal" };
  }

  if (THIRD_PARTY_BRAND_SIGNALS.some((p) => p.test(text)) && !titleOwnsBrand(domain, merchant, title)) {
    return { bucket: "REJECT", reason: "third_party_brand_gift_card_reseller_signal" };
  }

  if (!GIFT_SIGNAL.some((p) => p.test(text))) {
    return { bucket: "REVIEW", reason: "weak_gift_card_signal" };
  }

  if (!isGreekDomain(domain)) {
    return { bucket: "REVIEW", reason: "non_greek_domain" };
  }

  // If the result is on a Greek merchant domain and clearly looks like a direct gift-card page,
  // accept. If brand ownership is unclear, leave for review instead of auto-import.
  const cardPath = /gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ/i.test(url);
  const directTitle = GIFT_SIGNAL.some((p) => p.test(title));

  if ((cardPath || directTitle) && titleOwnsBrand(domain, merchant, title)) {
    return { bucket: "AUTO_SAFE", reason: "greek_domain_direct_owned_brand_gift_card" };
  }

  if (cardPath || directTitle) {
    return { bucket: "REVIEW", reason: "greek_direct_gift_card_but_brand_ownership_unclear" };
  }

  return { bucket: "REVIEW", reason: "insufficient_owned_brand_evidence" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));

const autoSafe: Record<string, unknown>[] = [];
const review: Record<string, unknown>[] = [];
const reject: Record<string, unknown>[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = { ...row, clean_bucket: c.bucket, clean_reason: c.reason };
  if (c.bucket === "AUTO_SAFE") autoSafe.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else review.push(out);
}

const headers = [
  "score","domain","merchant_name","possible_official_url",
  "title","snippet","query","clean_bucket","clean_reason"
];

writeCsv(AUTO_SAFE, autoSafe, headers);
writeCsv(REVIEW, review, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_rows: rows.length,
  auto_safe_owned_brand: autoSafe.length,
  review: review.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Mass Harvest Cleaner v5.4");
console.log("====================================");
console.log(`Input rows: ${rows.length}`);
console.log(`AUTO_SAFE_OWNED_BRAND: ${autoSafe.length}`);
console.log(`REVIEW: ${review.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`Auto-safe CSV: ${AUTO_SAFE}`);
console.log(`Review CSV: ${REVIEW}`);
console.log(`Reject CSV: ${REJECT}`);
console.log("");
console.log("No database changes were made.");
