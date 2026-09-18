import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const CSV = path.join(
  process.cwd(),
  "data",
  "discovery",
  "mass-harvest-v5",
  "clean-v5.5",
  "auto-safe-final.csv",
);

if (!fs.existsSync(CSV)) {
  throw new Error(`Missing CSV: ${CSV}`);
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
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanMerchantName(title: string, domain: string) {
  let s = title
    .replace(/\s*[|–—-]\s*(gift\s*cards?|e-?gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές)).*$/i, "")
    .replace(/\s*[|–—-]\s*(official\s*(site|store)|online\s*shop).*$/i, "")
    .trim();

  if (!s || s.length < 2 || s.length > 80 || /gift card/i.test(s)) {
    const base = domain
      .replace(/^www\./, "")
      .replace(/\.(com\.gr|net\.gr|org\.gr|gr)$/i, "")
      .split(".")
      .pop() || domain;

    s = base
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  return s.slice(0, 100);
}

async function main() {
  console.log("Dorokartes Import Auto-Safe v5.5");
  console.log("================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("");

  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  const existingDiscovery = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      sourceType: true,
      sourceName: true,
    },
  });

  const production = await prisma.merchant.findMany({
    select: {
      websiteUrl: true,
      giftCards: {
        select: { officialUrl: true },
      },
    },
  });

  const knownDomains = new Set<string>();

  for (const d of existingDiscovery) {
    const domain =
      domainFromUrl(d.possibleOfficialUrl) ||
      domainFromUrl(d.sourceUrl);
    if (domain) knownDomains.add(domain);
  }

  for (const m of production) {
    if (m.websiteUrl) {
      const d = domainFromUrl(m.websiteUrl);
      if (d) knownDomains.add(d);
    }

    for (const g of m.giftCards) {
      if (!g.officialUrl) continue;
      const d = domainFromUrl(g.officialUrl);
      if (d) knownDomains.add(d);
    }
  }

  const templateSource =
    existingDiscovery.find((x) => /google|serper/i.test(x.sourceName || "")) ||
    existingDiscovery[0];

  if (!templateSource) {
    throw new Error("No existing DiscoveryItem found to reuse sourceType.");
  }

  let eligible = 0;
  let skippedKnown = 0;
  let skippedInvalid = 0;
  let imported = 0;

  const plan: {
    domain: string;
    merchantName: string;
    title: string;
    officialUrl: string;
    score: number;
  }[] = [];

  for (const row of rows) {
    const officialUrl = String(row.possible_official_url || "").trim();
    const domain = domainFromUrl(officialUrl);
    const title = String(row.title || "").trim();
    const score = Number(row.score || "0");

    if (!officialUrl || !domain) {
      skippedInvalid++;
      continue;
    }

    if (knownDomains.has(domain)) {
      skippedKnown++;
      continue;
    }

    const merchantName = cleanMerchantName(title, domain);

    plan.push({
      domain,
      merchantName,
      title,
      officialUrl,
      score,
    });

    knownDomains.add(domain);
    eligible++;
  }

  console.log(`CSV rows: ${rows.length}`);
  console.log(`Eligible new domains: ${eligible}`);
  console.log(`Skipped already known: ${skippedKnown}`);
  console.log(`Skipped invalid: ${skippedInvalid}`);
  console.log("");

  console.log("PLAN SAMPLE:");
  for (const row of plan.slice(0, 40)) {
    console.log(
      `- ${row.domain} | ${row.merchantName} | score=${row.score}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  for (const row of plan) {
    await prisma.discoveryItem.create({
      data: {
        sourceType: templateSource.sourceType,
        sourceName: "Google Serper Mass Harvest v5.5 AUTO_SAFE",
        sourceUrl: row.officialUrl,
        title: row.title,
        merchantName: row.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: row.officialUrl,
        notes:
          `[MASS_HARVEST_V5_5_AUTO_SAFE]\n` +
          `Score=${row.score}\n` +
          `Domain=${row.domain}\n` +
          `AutoAccepted=YES`,
      },
    });

    imported++;
  }

  console.log("");
  console.log(`Imported as QUEUED: ${imported}`);
  console.log("No production Merchant/GiftCard rows were created yet.");
  console.log("Next: run pipeline:bulk-promote PLAN.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
