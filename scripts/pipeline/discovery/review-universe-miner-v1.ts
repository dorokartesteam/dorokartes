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
const OUT_DIR = path.join(DISCOVERY_ROOT, "review-universe-v1");

const UNIVERSE_CSV = path.join(OUT_DIR, "review-universe.csv");
const SECOND_PASS_SAFE_CSV = path.join(OUT_DIR, "second-pass-safe.csv");
const REVIEW_CSV = path.join(OUT_DIR, "still-review.csv");
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

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function normalizeDomain(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

function isGreekDomain(domain: string) {
  return (
    domain.endsWith(".gr") ||
    domain.endsWith(".com.gr") ||
    domain.endsWith(".net.gr") ||
    domain.endsWith(".org.gr")
  );
}

function registrableLabel(domain: string) {
  const d = normalizeDomain(domain);
  const parts = d.split(".");
  if (parts.length >= 3 && ["com.gr","net.gr","org.gr"].includes(parts.slice(-2).join("."))) {
    return parts[parts.length - 3];
  }
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "";
}

function normalizeText(s: string) {
  return (s || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, "")
    .trim();
}

const REVIEW_FILE_RX = /(^|[-_])(review|global-review|greece-market-review|manual-review|still-review)\.csv$/i;

const HARD_REJECT_DOMAINS = new Set([
  "24hr.gr","desertcart.gr","easytechnology.gr","fnet.gr","lifo.gr","freelancer.gr",
  "futuresoft.gr","g2a.com","eneba.com","etsy.com","egiftcards.nz","giftcards.bidali.com",
  "coincards.com","colnect.com","doctorsim.com","fleximart.ae","businessinsider.com",
  "businesswire.com","bitrefill.com","buysellvouchers.com","cardfly.net","cardtonic.com",
  "2gosoftware.eu","1minutepay.com","aceb.com","alliedmarketresearch.com","apps.apple.com",
  "asdagiftcards.com","baxity.com","becharge.be","bitmama.io","blackhawknetwork.com",
  "ubuy.com.gr","taxheaven.gr","support.payzy.gr"
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

const DIRECT_PATH = /gift[-_/ ]?card|gift[-_/ ]?voucher|δωροκαρ|δωροεπιταγ|καρτα[-_/ ]?δωρου/i;

function thirdPartyMismatch(domain: string, text: string) {
  const label = normalizeText(registrableLabel(domain));
  for (const [brand, rx] of THIRD_PARTY_BRANDS) {
    if (!rx.test(text)) continue;
    if (label.includes(normalizeText(brand))) continue;
    return brand;
  }
  return null;
}

function pick(row: Record<string,string>, ...keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function classify(row: any) {
  const domain = row.domain;
  const title = row.title || "";
  const snippet = row.snippet || "";
  const merchant = row.merchant_name || "";
  const url = row.possible_official_url || "";
  const text = `${merchant} ${title} ${snippet} ${url}`;

  if (!domain || !url) return { bucket: "REJECT", reason: "invalid_url_or_domain" };
  if (HARD_REJECT_DOMAINS.has(domain)) return { bucket: "REJECT", reason: "known_false_positive_or_reseller" };
  if (BAD_SUBDOMAIN.some((rx) => rx.test(domain))) return { bucket: "REJECT", reason: "unsafe_subdomain" };
  if (NON_MERCHANT.some((rx) => rx.test(text))) return { bucket: "REJECT", reason: "non_merchant_signal" };

  const mismatch = thirdPartyMismatch(domain, text);
  if (mismatch) return { bucket: "REJECT", reason: `third_party_${mismatch}_gift_card` };

  if (!GIFT_SIGNAL.some((rx) => rx.test(text))) {
    return { bucket: "REVIEW", reason: "weak_gift_signal" };
  }

  let pathname = "";
  try { pathname = new URL(url).pathname; } catch {}

  const directEvidence = DIRECT_PATH.test(pathname) || GIFT_SIGNAL.some((rx) => rx.test(title));
  if (!directEvidence) {
    return { bucket: "REVIEW", reason: "gift_signal_only_in_snippet" };
  }

  const label = normalizeText(registrableLabel(domain));
  const titleMerchant = normalizeText(`${merchant} ${title}`);

  // Second-pass safe is broader than old AUTO_SAFE:
  // 1) Greek owned domain, direct evidence, OR
  // 2) non-Greek domain but clear brand/domain coherence + direct evidence.
  if (isGreekDomain(domain)) {
    if (label && label.length >= 3 && titleMerchant.includes(label)) {
      return { bucket: "SECOND_PASS_SAFE", reason: "greek_brand_coherent_direct_gift_card" };
    }
    return { bucket: "REVIEW", reason: "greek_domain_brand_coherence_unclear" };
  }

  if (label && label.length >= 4 && titleMerchant.includes(label)) {
    return { bucket: "SECOND_PASS_SAFE", reason: "non_greek_brand_coherent_direct_gift_card" };
  }

  return { bucket: "REVIEW", reason: "non_greek_brand_coherence_unclear" };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = walk(DISCOVERY_ROOT)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .filter((f) => !f.includes(path.sep + "review-universe-v1" + path.sep))
    .filter((f) => REVIEW_FILE_RX.test(path.basename(f)));

  const rawRows: any[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));

    for (const row of rows) {
      const url = pick(row, "possible_official_url", "possibleOfficialUrl", "officialUrl", "url", "sourceUrl");
      const domain = normalizeDomain(
        pick(row, "domain") || domainFromUrl(url)
      );

      if (!domain) continue;

      rawRows.push({
        score: pick(row, "score"),
        domain,
        merchant_name: pick(row, "merchant_name", "merchantName", "merchant"),
        possible_official_url: url,
        title: pick(row, "title"),
        snippet: pick(row, "snippet", "evidence", "notes"),
        query: pick(row, "query"),
        source_file: rel,
      });
    }
  }

  // Aggregate all historical review rows by domain.
  const byDomain = new Map<string, any>();

  for (const row of rawRows) {
    const prev = byDomain.get(row.domain);

    if (!prev) {
      byDomain.set(row.domain, {
        ...row,
        source_files: row.source_file,
        occurrences: 1,
      });
      continue;
    }

    prev.occurrences += 1;
    const sources = new Set(String(prev.source_files).split(" | ").filter(Boolean));
    sources.add(row.source_file);
    prev.source_files = [...sources].join(" | ");

    const prevScore = Number(prev.score || 0);
    const rowScore = Number(row.score || 0);

    if (rowScore > prevScore || (!prev.possible_official_url && row.possible_official_url)) {
      prev.score = row.score;
      prev.merchant_name = row.merchant_name || prev.merchant_name;
      prev.possible_official_url = row.possible_official_url || prev.possible_official_url;
      prev.title = row.title || prev.title;
      prev.snippet = row.snippet || prev.snippet;
      prev.query = row.query || prev.query;
    }
  }

  const [production, discovery] = await Promise.all([
    prisma.merchant.findMany({
      select: {
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
    prisma.discoveryItem.findMany({
      select: {
        status: true,
        possibleOfficialUrl: true,
        sourceUrl: true,
      },
    }),
  ]);

  const productionDomains = new Set<string>();
  for (const m of production) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const d = domainFromUrl(u);
      if (d) productionDomains.add(normalizeDomain(d));
    }
  }

  const discoveryStatusByDomain = new Map<string, Set<string>>();
  for (const d of discovery) {
    const dom = normalizeDomain(domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl));
    if (!dom) continue;
    if (!discoveryStatusByDomain.has(dom)) discoveryStatusByDomain.set(dom, new Set());
    discoveryStatusByDomain.get(dom)!.add(String(d.status));
  }

  const universe: any[] = [];
  const safe: any[] = [];
  const review: any[] = [];
  const reject: any[] = [];

  for (const row of [...byDomain.values()].sort((a,b) => a.domain.localeCompare(b.domain))) {
    const inProduction = productionDomains.has(row.domain);
    const statuses = [...(discoveryStatusByDomain.get(row.domain) || new Set())];

    if (inProduction || statuses.includes("VERIFIED")) {
      continue;
    }

    const c = classify(row);

    const out = {
      ...row,
      discovery_statuses: statuses.join("|"),
      result_bucket: c.bucket,
      result_reason: c.reason,
    };

    universe.push(out);

    if (c.bucket === "SECOND_PASS_SAFE") safe.push(out);
    else if (c.bucket === "REJECT") reject.push(out);
    else review.push(out);
  }

  const headers = [
    "score","domain","merchant_name","possible_official_url","title","snippet","query",
    "occurrences","source_files","discovery_statuses","result_bucket","result_reason"
  ];

  writeCsv(UNIVERSE_CSV, universe, headers);
  writeCsv(SECOND_PASS_SAFE_CSV, safe, headers);
  writeCsv(REVIEW_CSV, review, headers);
  writeCsv(REJECT_CSV, reject, headers);

  const summary = {
    review_csv_files_scanned: files.length,
    raw_review_rows_scanned: rawRows.length,
    unique_review_domains_before_db_filter: byDomain.size,
    remaining_unique_domains_after_production_verified_filter: universe.length,
    second_pass_safe: safe.length,
    still_review: review.length,
    reject: reject.length,
  };

  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log("Dorokartes Review Universe Miner v1");
  console.log("===================================");
  console.log(`Review CSV files scanned: ${summary.review_csv_files_scanned}`);
  console.log(`Raw review rows scanned: ${summary.raw_review_rows_scanned}`);
  console.log(`Unique review domains before DB filter: ${summary.unique_review_domains_before_db_filter}`);
  console.log(`Remaining unique domains: ${summary.remaining_unique_domains_after_production_verified_filter}`);
  console.log(`SECOND_PASS_SAFE: ${summary.second_pass_safe}`);
  console.log(`STILL_REVIEW: ${summary.still_review}`);
  console.log(`REJECT: ${summary.reject}`);
  console.log("");
  console.log(`Universe CSV: ${UNIVERSE_CSV}`);
  console.log(`Second-pass safe CSV: ${SECOND_PASS_SAFE_CSV}`);
  console.log(`Still-review CSV: ${REVIEW_CSV}`);
  console.log(`Reject CSV: ${REJECT_CSV}`);
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
