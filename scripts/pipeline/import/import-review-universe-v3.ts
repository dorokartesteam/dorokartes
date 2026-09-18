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
  "review-universe-v3",
  "auto-safe-greece.csv"
);

const OUT = path.join(
  ROOT,
  "data",
  "discovery",
  "review-universe-v3",
  "import-plan-v1.csv"
);

const MANUAL_EXCLUDE = new Set([
  "biano.gr",
  "sportvision.gr",
  "watches.trabakopoulos.gr",
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
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeDomain(d: string) {
  return d.toLowerCase().replace(/^www\./, "");
}

function cleanMerchantName(raw: string, domain: string) {
  let s = (raw || "").trim();

  const cutters = [
    /\s+[|–—-]\s+.*$/,
    /\s+Gift\s+Card.*$/i,
    /\s+Gift\s+Voucher.*$/i,
    /\s+Δωροκάρτα.*$/i,
    /\s+Δωροεπιταγή.*$/i,
  ];

  for (const rx of cutters) s = s.replace(rx, "").trim();

  if (!s || s.length < 2 || /^www\./i.test(s)) {
    s = domain.split(".")[0]
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  return s.slice(0, 160);
}

function cleanTitle(raw: string, merchant: string) {
  const s = (raw || "").trim();
  if (!s) return `${merchant} Gift Card`;
  return s.slice(0, 220);
}

async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`Missing CSV: ${CSV}`);

  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  const [existingDiscovery, merchants] = await Promise.all([
    prisma.discoveryItem.findMany({
      select: {
        id: true,
        status: true,
        merchantName: true,
        possibleOfficialUrl: true,
        sourceUrl: true,
      },
    }),
    prisma.merchant.findMany({
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        giftCards: {
          select: { officialUrl: true },
        },
      },
    }),
  ]);

  const knownDomains = new Set<string>();

  for (const d of existingDiscovery) {
    for (const raw of [d.possibleOfficialUrl, d.sourceUrl]) {
      const domain = normalizeDomain(domainFromUrl(raw));
      if (domain) knownDomains.add(domain);
    }
  }

  for (const m of merchants) {
    for (const raw of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const domain = normalizeDomain(domainFromUrl(raw));
      if (domain) knownDomains.add(domain);
    }
  }

  const plan: any[] = [];
  const seen = new Set<string>();

  let excludedManual = 0;
  let skippedKnown = 0;
  let invalid = 0;
  let duplicateCsv = 0;

  for (const row of rows) {
    const domain = normalizeDomain(String(row.domain || ""));
    const url = String(row.possible_official_url || "").trim();

    if (!domain || !url || !domainFromUrl(url)) {
      invalid++;
      continue;
    }

    if (MANUAL_EXCLUDE.has(domain)) {
      excludedManual++;
      continue;
    }

    if (seen.has(domain)) {
      duplicateCsv++;
      continue;
    }
    seen.add(domain);

    if (knownDomains.has(domain)) {
      skippedKnown++;
      continue;
    }

    const merchantName = cleanMerchantName(
      String(row.merchant_name || row.title || ""),
      domain
    );

    plan.push({
      domain,
      merchantName,
      title: cleanTitle(String(row.title || ""), merchantName),
      possibleOfficialUrl: url,
      score: String(row.score || ""),
      occurrences: String(row.occurrences || ""),
      action: "QUEUE_NEW",
    });
  }

  writeCsv(
    OUT,
    plan,
    [
      "domain",
      "merchantName",
      "title",
      "possibleOfficialUrl",
      "score",
      "occurrences",
      "action",
    ]
  );

  console.log("Dorokartes Review Universe v3 Importer");
  console.log("======================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`CSV rows: ${rows.length}`);
  console.log(`Eligible new rows: ${plan.length}`);
  console.log(`Manual exclusions: ${excludedManual}`);
  console.log(`Skipped known domains: ${skippedKnown}`);
  console.log(`Invalid rows: ${invalid}`);
  console.log(`Duplicate domains inside CSV: ${duplicateCsv}`);
  console.log(`Plan CSV: ${OUT}`);
  console.log("");

  for (const row of plan.slice(0, 150)) {
    console.log(
      `- ${row.domain} | ${row.merchantName} | ${row.possibleOfficialUrl}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  let created = 0;
  let failed = 0;

  for (const row of plan) {
    try {
      await prisma.discoveryItem.create({
        data: {
          sourceType: "SEARCH_ENGINE" as any,
          sourceName: "Review Universe v3",
          sourceUrl: row.possibleOfficialUrl,
          title: row.title,
          merchantName: row.merchantName,
          status: DiscoveryStatus.QUEUED,
          possibleOfficialUrl: row.possibleOfficialUrl,
          notes:
            `[REVIEW_UNIVERSE_V3]\n` +
            `Second-pass historical review recovery\n` +
            `score=${row.score || ""}\n` +
            `occurrences=${row.occurrences || ""}\n` +
            `domain=${row.domain}`,
        },
      });

      created++;
    } catch (error) {
      failed++;
      console.error(`FAILED ${row.domain}:`, error);
    }
  }

  console.log("");
  console.log(`Created QUEUED: ${created}`);
  console.log(`Failed: ${failed}`);
  console.log("");
  console.log("Next:");
  console.log("npm run pipeline:bulk-promote");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
