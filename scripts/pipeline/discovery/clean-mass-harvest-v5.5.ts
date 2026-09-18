import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "candidates.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "mass-harvest-v5", "clean-v5.5");

const AUTO_SAFE = path.join(OUT_DIR, "auto-safe-final.csv");
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
  if (parts.length >= 3 && parts.slice(-2).join(".") === "com.gr") return parts[parts.length - 3];
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

const KNOWN_FALSE_DOMAINS = new Set([
  "24hr.gr",
  "desertcart.gr",
  "easytechnology.gr",
  "fnet.gr",
  "lifo.gr",
  "freelancer.gr",
  "futuresoft.gr",
  "g2a.com",
  "eneba.com",
  "etsy.com",
  "egiftcards.nz",
  "giftcards.bidali.com",
  "coincards.com",
  "colnect.com",
  "doctorsim.com",
  "fleximart.ae",
  "businessinsider.com",
  "businesswire.com",
  "bitrefill.com",
  "buysellvouchers.com",
  "cardfly.net",
  "cardtonic.com",
  "2gosoftware.eu",
  "1minutepay.com",
  "aceb.com",
  "alliedmarketresearch.com",
  "apps.apple.com",
  "asdagiftcards.com",
  "baxity.com",
  "becharge.be",
  "bitmama.io",
  "blackhawknetwork.com"
]);

const EXTERNAL_BRANDS = [
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

const NON_MERCHANT = [
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
  /design for/i,
  /\bdesign\b.*gift card/i,
  /gift card.*\bdesign\b/i,
];

const GIFT_TITLE_OR_PATH = /gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ|κάρτα[-_/ ]?δώρου/i;

function externalBrandMismatch(domain: string, text: string) {
  const label = normalize(registrableLabel(domain));
  for (const [brand, rx] of EXTERNAL_BRANDS) {
    if (!rx.test(text)) continue;
    if (label.includes(normalize(brand))) continue;
    return brand;
  }
  return null;
}

function classify(row: Record<string, string>) {
  const score = Number(row.score || "0");
  const url = row.possible_official_url || "";
  const domain = (row.domain || domainFromUrl(url)).toLowerCase();
  const title = row.title || "";
  const snippet = row.snippet || "";
  const merchant = row.merchant_name || "";
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (score < 90) return { bucket: "REVIEW", reason: "score_below_90" };
  if (!isGreekDomain(domain)) return { bucket: "REVIEW", reason: "non_greek_domain" };

  if (KNOWN_FALSE_DOMAINS.has(domain)) {
    return { bucket: "REJECT", reason: "known_false_positive_or_reseller" };
  }

  if (/^(blog|demo|app|business)\./i.test(domain)) {
    return { bucket: "REJECT", reason: "unsafe_subdomain" };
  }

  if (NON_MERCHANT.some((rx) => rx.test(text))) {
    return { bucket: "REJECT", reason: "non_merchant_or_design_software_signal" };
  }

  const mismatch = externalBrandMismatch(domain, text);
  if (mismatch) {
    return { bucket: "REJECT", reason: `third_party_${mismatch}_gift_card` };
  }

  let pathname = "";
  try { pathname = new URL(url).pathname; } catch {}

  const directEvidence =
    GIFT_TITLE_OR_PATH.test(title) ||
    GIFT_TITLE_OR_PATH.test(pathname);

  if (!directEvidence) {
    return { bucket: "REVIEW", reason: "gift_signal_only_in_snippet_not_direct_page" };
  }

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
  auto_safe_final: autoSafe.length,
  review: review.length,
  reject: reject.length,
}, null, 2) + "\n", "utf8");

console.log("Dorokartes Mass Harvest Cleaner v5.5");
console.log("====================================");
console.log(`Input rows: ${rows.length}`);
console.log(`AUTO_SAFE_FINAL: ${autoSafe.length}`);
console.log(`REVIEW: ${review.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`Auto-safe CSV: ${AUTO_SAFE}`);
console.log(`Review CSV: ${REVIEW}`);
console.log(`Reject CSV: ${REJECT}`);
console.log("");
console.log("No database changes were made.");
