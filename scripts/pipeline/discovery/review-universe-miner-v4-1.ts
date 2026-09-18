import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN = path.join(ROOT, "data", "discovery", "review-universe-v4", "auto-safe.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v4-1");

const STRICT = path.join(OUT_DIR, "auto-safe-strict.csv");
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

const DIRECT_TITLE = [
  /^gift\s*cards?$/i,
  /^gift\s*vouchers?$/i,
  /^digital\s+gift\s+card$/i,
  /^e-?gift\s+card$/i,
  /^δωροκάρτ[αες]/i,
  /^δωροεπιταγ[ήες]/i,
  /^κάρτα\s+δώρου/i,
  /gift\s*card/i,
  /gift\s*voucher/i,
  /δωροκάρτ/i,
  /δωροεπιταγ/i,
];

const DIRECT_URL = /gift[-_/]?card|gift[-_/]?voucher|gift[-_/]?certificate|dorokart|dwrokart|δωροκαρ|δωροεπιταγ|voucher/i;

const BAD_SUBDOMAIN = [
  /^faq\./i,
  /^support\./i,
  /^help\./i,
  /^tickets\./i,
  /^promo\./i,
  /^staging\./i,
  /^demo\./i,
  /^dev\./i,
  /^test\./i,
];

const EDITORIAL_DOMAINS = new Set([
  "epixeiro.gr",
  "neakriti.gr",
  "neolaia.gr",
  "popaganda.gr",
  "queen.gr",
  "tanea.gr",
  "thetoc.gr",
  "iefimerida.gr",
  "insomnia.gr",
  "ioannasnotebook.gr",
  "autotriti.gr",
  "energyin.gr",
  "banks.com.gr",
  "linguee.gr",
  "glami.gr",
  "find.gr",
  "tripadvisor.com.gr",
  "cretalive.gr",
]);

const BAD_TITLE = [
  /^archives?$/i,
  /^faq$/i,
  /terms of purchase/i,
  /terms.*gift vouchers/i,
  /κέρδισε/i,
  /διαγωνισμ/i,
  /με κάθε αγορά/i,
  /με αγορά/i,
  /fake/i,
  /τι κρύβει/i,
  /παρουσιάζει/i,
  /οδηγός/i,
  /gift card.*factory sale/i,
  /gift card box/i,
  /gift certificates for business/i,
  /μετάφραση/i,
  /gift card.*outlet/i,
  /αρχεία\b/i,
];

const WEAK_ONLY = [
  /^com$/i,
  /^archives?$/i,
  /^\d+\s*(€|eur)?$/i,
  /^product categories$/i,
  /^eshop eu$/i,
];

function classify(row: Record<string,string>) {
  const domain = String(row.domain || "").toLowerCase().replace(/^www\./, "");
  const title = String(row.title || "").trim();
  const url = String(row.possible_official_url || "").trim();

  if (!domain || !url) return { bucket: "REJECT", reason: "missing_domain_or_url" };
  if (!isGreekTld(domain)) return { bucket: "MANUAL", reason: "non_gr_domain" };
  if (BAD_SUBDOMAIN.some((rx) => rx.test(domain))) return { bucket: "MANUAL", reason: "support_promo_ticket_or_dev_subdomain" };
  if (EDITORIAL_DOMAINS.has(domain)) return { bucket: "REJECT", reason: "editorial_aggregator_or_news_domain" };
  if (BAD_TITLE.some((rx) => rx.test(title))) return { bucket: "REJECT", reason: "editorial_promo_terms_or_archive_title" };
  if (WEAK_ONLY.some((rx) => rx.test(title))) return { bucket: "MANUAL", reason: "weak_generic_title" };

  const directUrl = DIRECT_URL.test(url);
  const directTitle = DIRECT_TITLE.some((rx) => rx.test(title));

  if (directUrl && directTitle) {
    return { bucket: "AUTO_SAFE_STRICT", reason: "greek_domain_direct_url_and_title" };
  }

  if (directUrl && !WEAK_ONLY.some((rx) => rx.test(title))) {
    return { bucket: "AUTO_SAFE_STRICT", reason: "greek_domain_direct_gift_url" };
  }

  if (directTitle) {
    return { bucket: "MANUAL", reason: "gift_title_but_url_not_direct" };
  }

  return { bucket: "MANUAL", reason: "insufficient_direct_evidence" };
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));
const strict: any[] = [];
const manual: any[] = [];
const reject: any[] = [];

for (const row of rows) {
  const c = classify(row);
  const out = { ...row, v4_1_bucket: c.bucket, v4_1_reason: c.reason };
  if (c.bucket === "AUTO_SAFE_STRICT") strict.push(out);
  else if (c.bucket === "REJECT") reject.push(out);
  else manual.push(out);
}

const headers = [
  "v4_score","domain","merchant_name","possible_official_url","title","snippet","query",
  "occurrences","source_files","discovery_statuses","result_bucket","result_reason",
  "v4_bucket","v4_reason","v4_1_bucket","v4_1_reason"
];

writeCsv(STRICT, strict, headers);
writeCsv(MANUAL, manual, headers);
writeCsv(REJECT, reject, headers);

const summary = {
  input_auto_safe_v4: rows.length,
  auto_safe_strict: strict.length,
  manual_review: manual.length,
  reject: reject.length,
};

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Dorokartes Review Universe Miner v4.1");
console.log("=====================================");
console.log(`Input AUTO_SAFE v4: ${rows.length}`);
console.log(`AUTO_SAFE_STRICT: ${strict.length}`);
console.log(`MANUAL_REVIEW: ${manual.length}`);
console.log(`REJECT: ${reject.length}`);
console.log("");
console.log(`STRICT CSV: ${STRICT}`);
console.log(`MANUAL CSV: ${MANUAL}`);
console.log(`REJECT CSV: ${REJECT}`);
console.log("");
console.log("READ ONLY. No database changes were made.");
