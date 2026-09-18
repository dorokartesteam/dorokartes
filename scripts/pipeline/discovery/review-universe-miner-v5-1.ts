import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v5", "auto-greece-relevant.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v5-1");

const AUTO = path.join(OUT_DIR, "auto-greece-strict.csv");
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
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
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

function writeCsv(file: string, rows: any[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(esc).join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

const GREEK_PLACE = [
  /\bathens\b/i, /\bthessaloniki\b/i, /\bmykonos\b/i, /\bsantorini\b/i,
  /\bcrete\b/i, /\bcorfu\b/i, /\brhodes\b/i, /\bkalamata\b/i, /\blefkada\b/i,
  /\bchania\b/i, /\bkefalonia\b/i, /\bpatras\b/i, /\bioannina\b/i,
  /\bnafplio\b/i, /\bgreece\b/i,
  /αθήν/i, /θεσσαλονίκ/i, /μύκονο/i, /σαντορίν/i, /κρήτ/i, /κεφαλον/i,
  /ρόδ/i, /χάνι/i, /καλαμάτ/i
];

const DIRECT_GIFT = [
  /gift\s*card/i, /gift\s*voucher/i, /gift\s*certificate/i,
  /δωροκάρτ/i, /δωροεπιταγ/i, /κάρτα\s*δώρου/i, /voucher/i
];

const BAD_TEXT = [
  /buy .* gift cards? with crypto/i,
  /compare prices/i,
  /gift cards in greece \| 2000\+ brands/i,
  /send gift cards to greece/i,
  /what greece gift card is available/i,
  /stock photos/i,
  /meaning in greek/i,
  /market research/i,
  /industry report/i,
  /b2b companies and suppliers/i,
  /winner/i,
  /personalised .* voucher/i,
  /gift card outlet/i,
  /gift card reseller/i,
  /tripadvisor/i,
  /gift card depot/i,
  /gift vouchers depot/i,
  /buy attica greece gift cards/i,
];

const HARD_REJECT_DOMAINS = new Set([
  "greekcargo.com.au",
  "rhodeswood.co.uk",
  "tholosrestaurant.co.uk",
  "atheneoscafe.com",
  "greekhousecafe.com",
  "greekmarket.co.uk",
  "giverrang.com",
  "rodirestaurants.co.uk",
  "rhodeswaterside.com.au",
  "paran.com.au",
  "anastasiaskouzina.com.au",
  "mygreekkitchen.com.au",
  "athensnailbar.com",
  "bkstr.com",
  "beatone.co.uk",
  "bulldogflowersofathens.com",
  "smartcdkeys.com",
  "supportnow.org",
  "thecardzoo.com",
  "partyganimalprint.com",
  "partyanimalprint.com",
  "xbankang.com",
  "vouchersdepot.com",
  "hablax.com",
  "noones.com",
  "wizzgift.com",
  "europages.co.uk",
  "alamy.com",
  "jstor.org",
]);

const KNOWN_GOOD_HINTS = [
  /mykonos/i, /santorini/i, /crete/i, /kefalonia/i, /athens/i,
  /messinia/i, /corfu/i, /greek language course/i, /divani/i,
  /hellas canyon/i, /coya mykonos/i, /zuma mykonos/i
];

function classify(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase().replace(/^www\./, "");
  const title = String(row.title || "");
  const merchant = String(row.merchant_name || "");
  const snippet = String(row.snippet || "");
  const url = String(row.possible_official_url || "");
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (!domain || !url) return { bucket: "REJECT", reason: "missing_domain_or_url" };
  if (HARD_REJECT_DOMAINS.has(domain)) return { bucket: "REJECT", reason: "known_foreign_false_positive_or_reseller" };
  if (BAD_TEXT.some(rx => rx.test(text))) return { bucket: "REJECT", reason: "reseller_editorial_or_false_greece_signal" };

  const gift = DIRECT_GIFT.some(rx => rx.test(text));
  const greekPlace = GREEK_PLACE.some(rx => rx.test(text));
  if (!gift || !greekPlace) return { bucket: "MANUAL_REVIEW", reason: "weak_direct_greece_or_gift_evidence" };

  // Strict allow when the business itself is clearly Greece-based / Greece-focused.
  if (KNOWN_GOOD_HINTS.some(rx => rx.test(`${domain} ${merchant} ${title}`))) {
    return { bucket: "AUTO_GREECE_STRICT", reason: "clear_greece_business_and_direct_gift_signal" };
  }

  // Generic .com/.shop merchants with Greek place in evidence need human check.
  return { bucket: "MANUAL_REVIEW", reason: "greece_relevant_but_business_location_unclear" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));
const auto: any[] = [];
const manual: any[] = [];
const reject: any[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = { ...row, v5_1_bucket: c.bucket, v5_1_reason: c.reason };
  if (c.bucket === "AUTO_GREECE_STRICT") auto.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manual.push(out);
}

const headers = [
  "v4_score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v4_bucket","v4_reason","v5_bucket","v5_reason","v5_1_bucket","v5_1_reason"
];

writeCsv(AUTO, auto, headers);
writeCsv(MANUAL, manual, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_auto_greece_v5: rows.length,
  auto_greece_strict: auto.length,
  manual_review: manual.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v5.1");
console.log("=====================================");
console.log(`Input AUTO_GREECE_RELEVANT v5: ${rows.length}`);
console.log(`AUTO_GREECE_STRICT: ${auto.length}`);
console.log(`MANUAL_REVIEW: ${manual.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`AUTO CSV: ${AUTO}`);
console.log(`MANUAL CSV: ${MANUAL}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
