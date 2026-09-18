import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const ROOT = process.cwd();
const DISCOVERY_ROOT = path.join(ROOT, "data", "discovery");
const OUT_DIR = path.join(DISCOVERY_ROOT, "final-manual-universe-v1");

const ALL_CSV = path.join(OUT_DIR, "final-manual-universe.csv");
const SAFE_CSV = path.join(OUT_DIR, "safe.csv");
const REVIEW_CSV = path.join(OUT_DIR, "review.csv");
const REJECT_CSV = path.join(OUT_DIR, "reject.csv");
const SUMMARY_JSON = path.join(OUT_DIR, "summary.json");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
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
      } else cur += ch;
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
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function pick(row: Record<string,string>, ...keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function normalizeDomain(raw: string) {
  return raw.toLowerCase().replace(/^www\./, "");
}

function isGreekTld(domain: string) {
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

const MANUAL_FILE_RX = /(manual|review|global-greece-review|global-brand-review|still-review)\.csv$/i;

const GIFT_RX = [
  /gift\s*card/i, /gift\s*voucher/i, /gift\s*certificate/i,
  /δωροκάρτ/i, /δωροεπιταγ/i, /κάρτα\s*δώρου/i, /voucher/i
];

const URL_GIFT_RX = /gift[-_/]?card|gift[-_/]?voucher|gift[-_/]?certificate|dorokart|dwrokart|δωροκαρ|δωροεπιταγ|voucher/i;

const BAD_DOMAIN_RX = [
  /^support\./i, /^help\./i, /^faq\./i, /^news\./i, /^blog\./i,
  /^forum\./i, /^staging\./i, /^demo\./i, /^dev\./i, /^test\./i,
  /^promo\./i, /^tickets\./i
];

const BAD_TEXT_RX = [
  /market research/i, /market size/i, /industry report/i,
  /business intelligence/i, /gift card marketplace/i,
  /gift card reseller/i, /discount gift cards/i,
  /buy .* gift cards with crypto/i, /compare prices/i,
  /gift card software/i, /gift card platform/i,
  /gift card printing/i, /template/i, /mockup/i,
  /contest/i, /giveaway/i, /promo code/i,
  /terms and conditions/i, /forum/i, /news/i
];

function classify(row: any) {
  const domain = row.domain;
  const url = row.possibleOfficialUrl;
  const title = row.title || "";
  const merchant = row.merchantName || "";
  const notes = row.notes || "";
  const text = `${merchant} ${title} ${notes} ${url}`;

  if (!domain || !url) {
    return { bucket: "REVIEW", reason: "missing_or_invalid_official_url" };
  }

  if (BAD_DOMAIN_RX.some((rx) => rx.test(domain))) {
    return { bucket: "REJECT", reason: "support_news_blog_dev_or_promo_subdomain" };
  }

  if (BAD_TEXT_RX.some((rx) => rx.test(text))) {
    return { bucket: "REJECT", reason: "editorial_reseller_platform_or_promo_signal" };
  }

  const giftText = GIFT_RX.some((rx) => rx.test(text));
  const giftUrl = URL_GIFT_RX.test(url);
  const occurrences = Number(row.occurrences || 1) || 1;

  if (isGreekTld(domain) && giftUrl && giftText) {
    return { bucket: "SAFE", reason: "greek_domain_direct_gift_url_and_text" };
  }

  if (isGreekTld(domain) && giftUrl && occurrences >= 2) {
    return { bucket: "SAFE", reason: "greek_domain_direct_gift_url_repeated" };
  }

  if (giftText || giftUrl) {
    return { bucket: "REVIEW", reason: "plausible_giftcard_but_needs_human_check" };
  }

  return { bucket: "REVIEW", reason: "weak_signal" };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = walk(DISCOVERY_ROOT)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .filter((f) => !f.includes(path.sep + "final-manual-universe-v1" + path.sep))
    .filter((f) => MANUAL_FILE_RX.test(path.basename(f)));

  const raw: any[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));

    for (const row of rows) {
      const url = pick(
        row,
        "possible_official_url",
        "possibleOfficialUrl",
        "officialUrl",
        "url",
        "sourceUrl"
      );

      const domain = normalizeDomain(
        pick(row, "domain") || domainFromUrl(url)
      );

      if (!domain) continue;

      raw.push({
        domain,
        merchantName: pick(row, "merchantName", "merchant_name", "merchant"),
        possibleOfficialUrl: url,
        title: pick(row, "title"),
        notes: pick(row, "snippet", "notes", "reason", "v5_reason", "v4_reason"),
        score: pick(row, "v4_score", "score"),
        occurrences: pick(row, "occurrences") || "1",
        sourceFile: rel,
      });
    }
  }

  // Add active DB leftovers directly.
  const dbLeftovers = await prisma.discoveryItem.findMany({
    where: {
      status: { in: ["DISCOVERED", "QUEUED"] as any },
    },
    select: {
      id: true,
      status: true,
      merchantName: true,
      title: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      notes: true,
    },
  });

  for (const row of dbLeftovers) {
    const url = row.possibleOfficialUrl || row.sourceUrl || "";
    const domain = normalizeDomain(domainFromUrl(url));
    if (!domain) {
      raw.push({
        domain: "",
        merchantName: row.merchantName || "",
        possibleOfficialUrl: row.possibleOfficialUrl || "",
        title: row.title || "",
        notes: String(row.notes || ""),
        score: "",
        occurrences: "1",
        sourceFile: `DB:${row.status}:${row.id}`,
      });
      continue;
    }

    raw.push({
      domain,
      merchantName: row.merchantName || "",
      possibleOfficialUrl: row.possibleOfficialUrl || url,
      title: row.title || "",
      notes: String(row.notes || ""),
      score: "",
      occurrences: "1",
      sourceFile: `DB:${row.status}:${row.id}`,
    });
  }

  const [merchants, verified] = await Promise.all([
    prisma.merchant.findMany({
      select: {
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
    prisma.discoveryItem.findMany({
      where: { status: "VERIFIED" as any },
      select: {
        possibleOfficialUrl: true,
        sourceUrl: true,
      },
    }),
  ]);

  const productionDomains = new Set<string>();
  for (const m of merchants) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const d = normalizeDomain(domainFromUrl(u));
      if (d) productionDomains.add(d);
    }
  }

  const verifiedDomains = new Set<string>();
  for (const d of verified) {
    const dom = normalizeDomain(
      domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl)
    );
    if (dom) verifiedDomains.add(dom);
  }

  // Merge by domain, preserve evidence/source files.
  const byDomain = new Map<string, any>();
  const domainless: any[] = [];

  for (const row of raw) {
    if (!row.domain) {
      domainless.push(row);
      continue;
    }

    const prev = byDomain.get(row.domain);
    if (!prev) {
      byDomain.set(row.domain, {
        ...row,
        sourceFiles: row.sourceFile,
      });
      continue;
    }

    const sources = new Set(String(prev.sourceFiles || "").split(" | ").filter(Boolean));
    sources.add(row.sourceFile);
    prev.sourceFiles = [...sources].join(" | ");

    const prevOcc = Number(prev.occurrences || 1) || 1;
    const rowOcc = Number(row.occurrences || 1) || 1;
    prev.occurrences = String(Math.max(prevOcc, rowOcc));

    if (!prev.possibleOfficialUrl && row.possibleOfficialUrl) prev.possibleOfficialUrl = row.possibleOfficialUrl;
    if (!prev.merchantName && row.merchantName) prev.merchantName = row.merchantName;
    if (!prev.title && row.title) prev.title = row.title;
    if (!prev.notes && row.notes) prev.notes = row.notes;
    if (!prev.score && row.score) prev.score = row.score;
  }

  const rows: any[] = [];

  for (const row of byDomain.values()) {
    if (productionDomains.has(row.domain)) continue;
    if (verifiedDomains.has(row.domain)) continue;

    const c = classify(row);
    rows.push({
      ...row,
      bucket: c.bucket,
      reason: c.reason,
    });
  }

  for (const row of domainless) {
    rows.push({
      ...row,
      sourceFiles: row.sourceFile,
      bucket: "REVIEW",
      reason: "no_resolvable_domain",
    });
  }

  rows.sort((a,b) => {
    const order: any = { SAFE: 0, REVIEW: 1, REJECT: 2 };
    if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
    return String(a.domain).localeCompare(String(b.domain));
  });

  const safe = rows.filter(r => r.bucket === "SAFE");
  const review = rows.filter(r => r.bucket === "REVIEW");
  const reject = rows.filter(r => r.bucket === "REJECT");

  const headers = [
    "bucket","reason","domain","merchantName","possibleOfficialUrl","title",
    "score","occurrences","notes","sourceFiles"
  ];

  writeCsv(ALL_CSV, rows, headers);
  writeCsv(SAFE_CSV, safe, headers);
  writeCsv(REVIEW_CSV, review, headers);
  writeCsv(REJECT_CSV, reject, headers);

  const summary = {
    manual_review_csv_files_scanned: files.length,
    raw_rows_scanned_from_csvs: raw.length - dbLeftovers.length,
    db_leftovers_added: dbLeftovers.length,
    unique_domain_candidates_before_prod_filter: byDomain.size,
    production_domains_filtered: productionDomains.size,
    verified_domains_filtered: verifiedDomains.size,
    final_candidates: rows.length,
    safe: safe.length,
    review: review.length,
    reject: reject.length,
  };

  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log("Dorokartes Final Manual Universe v1");
  console.log("===================================");
  console.log(`Manual/review CSV files scanned: ${summary.manual_review_csv_files_scanned}`);
  console.log(`Raw CSV rows scanned: ${summary.raw_rows_scanned_from_csvs}`);
  console.log(`DB leftovers added: ${summary.db_leftovers_added}`);
  console.log(`Unique domain candidates before production filter: ${summary.unique_domain_candidates_before_prod_filter}`);
  console.log(`Final candidates after production/VERIFIED filter: ${summary.final_candidates}`);
  console.log(`SAFE: ${summary.safe}`);
  console.log(`REVIEW: ${summary.review}`);
  console.log(`REJECT: ${summary.reject}`);
  console.log("");
  console.log(`Universe CSV: ${ALL_CSV}`);
  console.log(`SAFE CSV: ${SAFE_CSV}`);
  console.log(`REVIEW CSV: ${REVIEW_CSV}`);
  console.log(`REJECT CSV: ${REJECT_CSV}`);
  console.log("");
  console.log("READ ONLY. No database changes were made.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
