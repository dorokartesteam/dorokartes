import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v2", "greek-safe.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v3");

const AUTO_SAFE = path.join(OUT_DIR, "auto-safe-greece.csv");
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

function isGreekTld(domain: string) {
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

const DIRECT_GIFT = [
  /gift\s*card/i,
  /gift\s*voucher/i,
  /e-?gift\s*card/i,
  /δωροκάρτ/i,
  /δωροεπιταγ/i,
  /κάρτα\s*δώρου/i,
  /giftcard/i,
];

const URL_GIFT = /gift[-_/]?card|gift[-_/]?voucher|dorokart|dwrokart|δωροκαρ|δωροεπιταγ/i;

const HARD_REJECT = [
  /^staging\./i,
  /^magento2dev\./i,
  /^support\./i,
  /^booking\./i,
  /^css\./i,
];

const BAD_CONTENT = [
  /οδηγός αγοράς.*δωροκάρτ/i,
  /guide.*gift card/i,
  /gift card balance/i,
  /gift card terms and conditions/i,
  /archives?\b/i,
  /comparison shopping/i,
  /online booking/i,
  /results matching/i,
  /gift card hub/i,
  /gift card solution/i,
];

const NON_GREEK_FALSE_POSITIVE = new Set([
  "all.accor.com",
  "best4travel.ie",
  "bristolcourses.com",
  "elementsmassage.com",
  "fredericmalle.eu",
  "greekbros.com",
  "greekpeak.net",
  "ithara.ae",
  "lazydayzdesigns.com",
  "levainbakery.com",
  "livlig.com",
  "loulerie.com",
  "mizensir.com",
  "mycover-protection.com",
  "mykonos-grill.com",
  "princess.com",
  "saunainter.com",
  "sausalitoferry.com",
  "shoeq.ae",
  "santorinigreekgrill.com",
  "santorinipizza.com",
  "support.only.com",
  "travelgift.uk",
]);

function classify(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase();
  const title = String(row.title || "");
  const merchant = String(row.merchant_name || "");
  const snippet = String(row.snippet || "");
  const url = String(row.possible_official_url || "");
  const text = `${merchant} ${title} ${snippet}`;

  if (!domain || !url) return { bucket: "REJECT", reason: "missing_domain_or_url" };
  if (HARD_REJECT.some((rx) => rx.test(domain))) return { bucket: "REJECT", reason: "staging_support_booking_or_dev_subdomain" };
  if (NON_GREEK_FALSE_POSITIVE.has(domain)) return { bucket: "REJECT", reason: "known_non_greece_false_positive" };
  if (BAD_CONTENT.some((rx) => rx.test(text))) return { bucket: "REJECT", reason: "content_page_not_direct_giftcard_offer" };

  const directTitle = DIRECT_GIFT.some((rx) => rx.test(title));
  const directUrl = URL_GIFT.test(url);

  // Strict auto-safe: Greek-owned TLD plus direct gift-card evidence in title or URL.
  if (isGreekTld(domain) && (directTitle || directUrl)) {
    return { bucket: "AUTO_SAFE_GREECE", reason: directTitle ? "greek_tld_direct_title" : "greek_tld_direct_url" };
  }

  // Non-.gr Greek businesses and weaker .gr evidence remain manual, not rejected.
  return { bucket: "MANUAL_REVIEW", reason: isGreekTld(domain) ? "greek_tld_but_direct_evidence_weak" : "non_gr_domain_requires_manual_market_check" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));
const autoSafe: Record<string,unknown>[] = [];
const manual: Record<string,unknown>[] = [];
const reject: Record<string,unknown>[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = { ...row, v3_bucket: c.bucket, v3_reason: c.reason };
  if (c.bucket === "AUTO_SAFE_GREECE") autoSafe.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manual.push(out);
}

const headers = [
  "score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v2_bucket","v2_reason","v3_bucket","v3_reason"
];

writeCsv(AUTO_SAFE, autoSafe, headers);
writeCsv(MANUAL, manual, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_greek_safe_v2: rows.length,
  auto_safe_greece: autoSafe.length,
  manual_review: manual.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v3");
console.log("===================================");
console.log(`Input GREEK_SAFE v2: ${rows.length}`);
console.log(`AUTO_SAFE_GREECE: ${autoSafe.length}`);
console.log(`MANUAL_REVIEW: ${manual.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`AUTO SAFE CSV: ${AUTO_SAFE}`);
console.log(`MANUAL CSV: ${MANUAL}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
