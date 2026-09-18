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
const CSV = path.join(ROOT, "data", "discovery", "review-universe-v5-1", "auto-greece-strict.csv");
const OUT_DIR = path.join(ROOT, "data", "discovery", "review-universe-v5-1");
const PLAN_CSV = path.join(OUT_DIR, "import-plan-v1.csv");
const MANUAL_CSV = path.join(OUT_DIR, "import-manual-v1.csv");

const FORCE_MANUAL = new Set([
  "gbcornergifts.com",
  "dmasalonconcept.glossgenius.com",
  "roomcard.com",
  "pureandcure.com",
  "santorinijewelry.shop",
  "santorinizenspa.travelotopos.com",
  "gifting.groupbanyan.com",
]);

const HARD_EXCLUDE = new Set([
  "vkathbeauty.com",
]);

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
  return lines.slice(1).map(line => {
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

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
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

function cleanMerchantName(raw: string, domain: string) {
  let s = (raw || "").trim()
    .replace(/^monetary gift voucher\s*[-–—|]?\s*/i, "")
    .replace(/^gift cards?\s*[-–—|]?\s*/i, "")
    .replace(/^gift voucher\s*[-–—|]?\s*/i, "")
    .replace(/\s+[|–—]\s+.*$/, "")
    .trim();

  if (!s || /^(com|shop|gift card|gift cards|gift voucher|gift vouchers)$/i.test(s)) {
    const label = domain.split(".")[0];
    s = label.replace(/[-_]+/g, " ").replace(/\b\w/g, m => m.toUpperCase());
  }

  return s.slice(0, 160);
}

async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`Missing CSV: ${CSV}`);
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  const [discoveries, merchants] = await Promise.all([
    prisma.discoveryItem.findMany({
      select: { possibleOfficialUrl: true, sourceUrl: true },
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
    for (const u of [m.websiteUrl, ...m.giftCards.map(g => g.officialUrl)]) {
      const dom = domainFromUrl(u);
      if (dom) known.add(dom);
    }
  }

  const eligible: any[] = [];
  const manual: any[] = [];
  const seen = new Set<string>();
  let skippedKnown = 0, invalid = 0, duplicateCsv = 0, hardExcluded = 0;

  for (const row of rows) {
    const domain = String(row.domain || "").toLowerCase().replace(/^www\./, "");
    const url = cleanTracking(String(row.possible_official_url || "").trim());
    const title = String(row.title || "").trim();

    if (!domain || !domainFromUrl(url)) { invalid++; continue; }
    if (seen.has(domain)) { duplicateCsv++; continue; }
    seen.add(domain);

    if (known.has(domain)) { skippedKnown++; continue; }
    if (HARD_EXCLUDE.has(domain)) { hardExcluded++; continue; }

    const merchantName = cleanMerchantName(String(row.merchant_name || ""), domain);

    const item = {
      domain,
      merchantName,
      title: title || `${merchantName} Gift Card`,
      possibleOfficialUrl: url,
      score: String(row.v4_score || row.score || ""),
      occurrences: String(row.occurrences || ""),
      reason: "",
    };

    if (FORCE_MANUAL.has(domain)) {
      item.reason = "manual_verification_required";
      manual.push(item);
      continue;
    }

    eligible.push({ ...item, action: "QUEUE_NEW" });
  }

  const headers = [
    "domain","merchantName","title","possibleOfficialUrl",
    "score","occurrences","reason","action"
  ];

  writeCsv(PLAN_CSV, eligible, headers);
  writeCsv(MANUAL_CSV, manual, headers);

  console.log("Dorokartes Review Universe v5.1 Importer");
  console.log("========================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`CSV rows: ${rows.length}`);
  console.log(`Eligible new rows: ${eligible.length}`);
  console.log(`Manual review rows: ${manual.length}`);
  console.log(`Hard exclusions: ${hardExcluded}`);
  console.log(`Skipped known domains: ${skippedKnown}`);
  console.log(`Invalid rows: ${invalid}`);
  console.log(`Duplicate domains inside CSV: ${duplicateCsv}`);
  console.log(`Plan CSV: ${PLAN_CSV}`);
  console.log(`Manual CSV: ${MANUAL_CSV}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  let created = 0, failed = 0;
  for (const row of eligible) {
    try {
      await prisma.discoveryItem.create({
        data: {
          sourceType: "SEARCH_ENGINE" as any,
          sourceName: "Review Universe v5.1",
          sourceUrl: row.possibleOfficialUrl,
          title: row.title,
          merchantName: row.merchantName,
          status: DiscoveryStatus.QUEUED,
          possibleOfficialUrl: row.possibleOfficialUrl,
          notes:
            `[REVIEW_UNIVERSE_V5_1]\n` +
            `Greece-relevant historical recovery\n` +
            `score=${row.score}\noccurrences=${row.occurrences}\ndomain=${row.domain}`,
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
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
