import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const ROOT = process.cwd();
const CSV = path.join(
  ROOT,
  "data",
  "discovery",
  "review-universe-v4-1",
  "auto-safe-strict.csv"
);

const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v4-1");
const PLAN_CSV = path.join(OUT_DIR, "import-plan-v1.csv");
const MANUAL_CSV = path.join(OUT_DIR, "import-manual-v1.csv");
const REJECT_CSV = path.join(OUT_DIR, "import-reject-v1.csv");

// Known false positives / editorial / promo / aggregator / previously rejected.
const HARD_EXCLUDE = new Set([
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
  "fruugo.gr",
  "vendora.gr",
  "cdkeyprices.gr",
  "zamanos.gr",
  "aioloscourier.gr",
]);

// Plausible merchant, but evidence/URL is not strong enough for blind promotion.
const FORCE_MANUAL = new Set([
  "edenred.gr",
  "piraeusbank.gr",
  "maccosmetics.gr",
  "xalkiadakis.gr",
  "ask.ab.gr",
  "electronet.gr",
  "enerwave.gr",
  "dioptra.gr",
  "lvk.ufr.gr",
  "summitgym.ufr.gr",
  "kois.e-pragma.gr",
  "eshop.handospa.gr",
  "sportsdirect.gr",
  "royalgrandhotel.gr",
  "istionclub.gr",
  "sagiakos.gr",
  "ifadishop.gr",
  "ktmpatras.gr",
  "markakis.gr",
  "santowines.gr",
  "tkdmarousi.gr",
  "athoshellas.gr",
]);

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

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanTracking(raw: string) {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(srsltid|utm_|gclid|fbclid)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function genericOrBadTitle(title: string) {
  return (
    /^archives?$/i.test(title) ||
    /^faq$/i.test(title) ||
    /terms of purchase/i.test(title) ||
    /terms.*gift voucher/i.test(title) ||
    /αρχεία\b/i.test(title) ||
    /κέρδισε/i.test(title) ||
    /διαγωνισμ/i.test(title) ||
    /με κάθε αγορά/i.test(title) ||
    /με αγορά/i.test(title) ||
    /gift card box/i.test(title) ||
    /factory sale/i.test(title)
  );
}

function suspiciousSubdomain(domain: string) {
  return /^(faq|support|help|tickets|promo|staging|demo|dev|test)\./i.test(domain);
}

function cleanMerchantName(raw: string, domain: string) {
  let s = (raw || "").trim();

  // Strip obvious gift-card wording from names.
  s = s
    .replace(/^gift\s*card\s*[–—|-]?\s*/i, "")
    .replace(/^δωροκάρτα\s*[–—|-]?\s*/i, "")
    .replace(/^αγοράστε μία δωροεπιταγή\s*[–—|-]?\s*/i, "")
    .replace(/\s+[|–—]\s+.*$/, "")
    .trim();

  const generic = [
    /^gift cards?$/i,
    /^gift vouchers?$/i,
    /^δωροκάρτ[αες]$/i,
    /^δωροεπιταγ[ήες]$/i,
    /^\d+\s*(€|eur|chf)?$/i,
    /^com$/i,
  ].some((rx) => rx.test(s));

  if (!s || generic) {
    const label = domain.split(".")[0];
    s = label
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  return s.slice(0, 160);
}

async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`Missing CSV: ${CSV}`);
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  const [discoveries, merchants] = await Promise.all([
    prisma.discoveryItem.findMany({
      select: {
        possibleOfficialUrl: true,
        sourceUrl: true,
      },
    }),
    prisma.merchant.findMany({
      select: {
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
  ]);

  const known = new Set<string>();

  for (const d of discoveries) {
    for (const u of [d.possibleOfficialUrl, d.sourceUrl]) {
      const dom = domainFromUrl(u);
      if (dom) known.add(dom);
    }
  }

  for (const m of merchants) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const dom = domainFromUrl(u);
      if (dom) known.add(dom);
    }
  }

  const eligible: any[] = [];
  const manual: any[] = [];
  const reject: any[] = [];
  const seen = new Set<string>();

  let skippedKnown = 0;
  let duplicateCsv = 0;
  let invalid = 0;

  for (const row of rows) {
    const domain = String(row.domain || "").toLowerCase().replace(/^www\./, "");
    const rawUrl = String(row.possible_official_url || "").trim();
    const url = cleanTracking(rawUrl);
    const title = String(row.title || "").trim();

    if (!domain || !domainFromUrl(url)) {
      invalid++;
      continue;
    }

    if (seen.has(domain)) {
      duplicateCsv++;
      continue;
    }
    seen.add(domain);

    // Canonical duplicate: keep tattooathens.gr, not tattooathens.com.gr.
    if (domain === "tattooathens.com.gr") {
      manual.push({
        domain,
        merchantName: cleanMerchantName(String(row.merchant_name || ""), domain),
        title,
        possibleOfficialUrl: url,
        reason: "canonical_duplicate_of_tattooathens.gr",
      });
      continue;
    }

    if (known.has(domain)) {
      skippedKnown++;
      continue;
    }

    if (HARD_EXCLUDE.has(domain)) {
      reject.push({
        domain,
        merchantName: cleanMerchantName(String(row.merchant_name || ""), domain),
        title,
        possibleOfficialUrl: url,
        reason: "known_false_positive_editorial_reseller_or_marketplace",
      });
      continue;
    }

    if (FORCE_MANUAL.has(domain) || suspiciousSubdomain(domain)) {
      manual.push({
        domain,
        merchantName: cleanMerchantName(String(row.merchant_name || ""), domain),
        title,
        possibleOfficialUrl: url,
        reason: "manual_evidence_or_subdomain_check",
      });
      continue;
    }

    if (genericOrBadTitle(title)) {
      manual.push({
        domain,
        merchantName: cleanMerchantName(String(row.merchant_name || ""), domain),
        title,
        possibleOfficialUrl: url,
        reason: "archive_terms_promo_or_generic_content_page",
      });
      continue;
    }

    eligible.push({
      domain,
      merchantName: cleanMerchantName(String(row.merchant_name || ""), domain),
      title: title || `${cleanMerchantName(String(row.merchant_name || ""), domain)} Gift Card`,
      possibleOfficialUrl: url,
      score: String(row.v4_score || row.score || ""),
      occurrences: String(row.occurrences || ""),
      action: "QUEUE_NEW",
    });
  }

  const headers = [
    "domain",
    "merchantName",
    "title",
    "possibleOfficialUrl",
    "score",
    "occurrences",
    "reason",
    "action",
  ];

  writeCsv(PLAN_CSV, eligible, headers);
  writeCsv(MANUAL_CSV, manual, headers);
  writeCsv(REJECT_CSV, reject, headers);

  console.log("Dorokartes Review Universe v4.1 Importer");
  console.log("========================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`CSV rows: ${rows.length}`);
  console.log(`Eligible new rows: ${eligible.length}`);
  console.log(`Manual review rows: ${manual.length}`);
  console.log(`Rejected rows: ${reject.length}`);
  console.log(`Skipped known domains: ${skippedKnown}`);
  console.log(`Invalid rows: ${invalid}`);
  console.log(`Duplicate domains inside CSV: ${duplicateCsv}`);
  console.log(`Plan CSV: ${PLAN_CSV}`);
  console.log(`Manual CSV: ${MANUAL_CSV}`);
  console.log(`Reject CSV: ${REJECT_CSV}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  let created = 0;
  let failed = 0;

  for (const row of eligible) {
    try {
      await prisma.discoveryItem.create({
        data: {
          sourceType: "SEARCH_ENGINE" as any,
          sourceName: "Review Universe v4.1",
          sourceUrl: row.possibleOfficialUrl,
          title: row.title,
          merchantName: row.merchantName,
          status: DiscoveryStatus.QUEUED,
          possibleOfficialUrl: row.possibleOfficialUrl,
          notes:
            `[REVIEW_UNIVERSE_V4_1]\n` +
            `Historical STILL_REVIEW recovery\n` +
            `score=${row.score}\n` +
            `occurrences=${row.occurrences}\n` +
            `domain=${row.domain}`,
        },
      });
      created++;
    } catch (e) {
      failed++;
      console.error(`FAILED ${row.domain}:`, e);
    }
  }

  console.log("");
  console.log(`Created QUEUED: ${created}`);
  console.log(`Failed: ${failed}`);
  console.log("Next: npm run pipeline:bulk-promote");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
