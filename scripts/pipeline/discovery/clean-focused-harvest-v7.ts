import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "focused-harvest-v7", "candidates.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "focused-harvest-v7", "clean-v7");

const AUTO_SAFE = path.join(OUT_DIR, "auto-safe.csv");
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

function isGreekDomain(domain: string) {
  return domain.endsWith(".gr") || domain.endsWith(".com.gr") || domain.endsWith(".net.gr") || domain.endsWith(".org.gr");
}

function registrableLabel(domain: string) {
  const d = domain.replace(/^www\./, "");
  const parts = d.split(".");
  if (parts.length >= 3 && ["com.gr","net.gr","org.gr"].includes(parts.slice(-2).join("."))) {
    return parts[parts.length - 3];
  }
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "";
}

function normalize(s: string) {
  return (s || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, "")
    .trim();
}

const HARD_REJECT_DOMAINS = new Set([
  "24hr.gr","desertcart.gr","easytechnology.gr","fnet.gr","lifo.gr","freelancer.gr",
  "futuresoft.gr","g2a.com","eneba.com","etsy.com","egiftcards.nz","giftcards.bidali.com",
  "coincards.com","colnect.com","doctorsim.com","fleximart.ae","businessinsider.com",
  "businesswire.com","bitrefill.com","buysellvouchers.com","cardfly.net","cardtonic.com",
  "2gosoftware.eu","1minutepay.com","aceb.com","alliedmarketresearch.com","apps.apple.com",
  "asdagiftcards.com","baxity.com","becharge.be","bitmama.io","blackhawknetwork.com"
]);

const BAD_SUBDOMAIN = [/^blog\./i,/^demo\./i,/^app\./i,/^business\./i,/^giftcards?\./i];

const NON_MERCHANT = [
  /market research/i,/market size/i,/market share/i,/market intelligence/i,/analysis\b/i,
  /industry report/i,/gift card printing/i,/custom gift card boxes/i,/voucher printing/i,
  /software solution/i,/portfolio/i,/creation of a gift voucher/i,/gift card holder/i,
  /card holder/i,/template/i,/mockup/i,/printable/i,/svg\b/i,/vector\b/i,/giveaway/i,
  /win a .*gift voucher/i,/coupon/i,/promo code/i,/gift card exchange/i,/reseller/i
];

const THIRD_PARTY_BRANDS = [
  ["netflix", /netflix/i],
  ["steam", /steam/i],
  ["xbox", /xbox/i],
  ["playstation", /playstation|psn/i],
  ["amazon", /amazon/i],
  ["apple", /\bapple\b/i],
  ["googleplay", /google play/i],
  ["spotify", /spotify/i],
  ["plaisio", /plaisio/i],
  ["skroutz", /skroutz/i],
  ["sephora", /sephora/i],
  ["douglas", /douglas/i],
  ["ikea", /\bikea\b/i],
  ["razer", /razer/i],
  ["hp", /\bhp\b/i],
] as const;

const GIFT_SIGNAL = [
  /gift card/i,/gift cards/i,/e-?gift card/i,/gift voucher/i,/gift vouchers/i,
  /δωροκάρτα/i,/δωροκάρτες/i,/δωροεπιταγή/i,/δωροεπιταγές/i,/κάρτα δώρου/i
];

const DIRECT_SIGNAL = /gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ|καρτα[-_/ ]?δωρου/i;

function thirdPartyMismatch(domain: string, text: string) {
  const label = normalize(registrableLabel(domain));
  for (const [brand, rx] of THIRD_PARTY_BRANDS) {
    if (!rx.test(text)) continue;
    if (label.includes(normalize(brand))) continue;
    return brand;
  }
  return null;
}

function classify(row: Record<string, string>) {
  const score = Number(row.score || "0");
  const url = String(row.possible_official_url || "");
  const domain = String(row.domain || domainFromUrl(url)).toLowerCase();
  const merchant = String(row.merchant_name || "");
  const title = String(row.title || "");
  const snippet = String(row.snippet || "");
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (!url || !domain) return { bucket: "REJECT", reason: "invalid_url_or_domain" };
  if (HARD_REJECT_DOMAINS.has(domain)) return { bucket: "REJECT", reason: "known_false_positive_or_reseller" };
  if (BAD_SUBDOMAIN.some((rx) => rx.test(domain))) return { bucket: "REJECT", reason: "unsafe_subdomain" };
  if (NON_MERCHANT.some((rx) => rx.test(text))) return { bucket: "REJECT", reason: "non_merchant_signal" };

  const mismatch = thirdPartyMismatch(domain, text);
  if (mismatch) return { bucket: "REJECT", reason: `third_party_${mismatch}_gift_card` };

  if (!GIFT_SIGNAL.some((rx) => rx.test(text))) return { bucket: "REVIEW", reason: "weak_gift_signal" };

  let pathname = "";
  try { pathname = new URL(url).pathname; } catch {}

  const directEvidence = DIRECT_SIGNAL.test(pathname) || GIFT_SIGNAL.some((rx) => rx.test(title));
  if (!directEvidence) return { bucket: "REVIEW", reason: "gift_signal_only_in_snippet" };

  if (score < 90) return { bucket: "REVIEW", reason: "score_below_90" };

  if (!isGreekDomain(domain)) return { bucket: "REVIEW", reason: "non_greek_domain" };

  const label = normalize(registrableLabel(domain));
  const titleMerchant = normalize(`${merchant} ${title}`);

  if (!label || label.length < 3 || !titleMerchant.includes(label)) {
    return { bucket: "REVIEW", reason: "brand_domain_coherence_unclear" };
  }

  return { bucket: "AUTO_SAFE", reason: "greek_owned_brand_direct_gift_card_page" };
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

fs.writeFileSync(SUMMARY, JSON.stringify({
  input_rows: rows.length,
  auto_safe: autoSafe.length,
  review: review.length,
  reject: reject.length,
}, null, 2) + "\n", "utf8");

console.log("Dorokartes Focused Harvest Cleaner v7");
console.log("=====================================");
console.log(`Input rows: ${rows.length}`);
console.log(`AUTO_SAFE: ${autoSafe.length}`);
console.log(`REVIEW: ${review.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`Auto-safe CSV: ${AUTO_SAFE}`);
console.log(`Review CSV: ${REVIEW}`);
console.log(`Reject CSV: ${REJECT}`);
console.log("");
console.log("No database changes were made.");
