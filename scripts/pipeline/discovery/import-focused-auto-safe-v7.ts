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

const CSV = path.join(
  process.cwd(),
  "data",
  "discovery",
  "focused-harvest-v7",
  "clean-v7",
  "auto-safe.csv",
);

if (!fs.existsSync(CSV)) throw new Error(`Missing CSV: ${CSV}`);

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

function baseBrand(domain: string) {
  const d = domain.replace(/^www\./, "");
  const parts = d.split(".");
  if (parts.length >= 3 && ["com.gr","net.gr","org.gr"].includes(parts.slice(-2).join("."))) {
    return parts[parts.length - 3];
  }
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || domain;
}

function titleCaseBrand(s: string) {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function cleanMerchantName(title: string, domain: string) {
  let s = title
    .replace(/^\s*(gift\s*cards?|e-?gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές))\s*[-|–—:]?\s*/i, "")
    .replace(/\s*[|–—-]\s*(gift\s*cards?|e-?gift\s*cards?|gift\s*vouchers?|δωροκάρτ(?:α|ες)|δωροεπιταγ(?:ή|ές)).*$/i, "")
    .trim();

  if (
    !s ||
    s.length < 2 ||
    s.length > 80 ||
    /gift\s*(card|voucher)|δωροκάρτ|δωροεπιταγ/i.test(s)
  ) {
    s = titleCaseBrand(baseBrand(domain));
  }

  return s.slice(0, 100);
}

// Explicit manual exclusions from reviewed AUTO_SAFE sample.
const MANUAL_EXCLUDE = new Set([
  "support.payzy.gr",   // contest/support article, not merchant gift-card program
  "taxheaven.gr",       // forum/editorial content
  "ubuy.com.gr",        // marketplace/reseller
  "zamanos.gr",         // tag/news page rather than direct gift-card product
  "mail.cosycorner.gr", // mail subdomain; keep for manual verification
]);

async function main() {
  console.log("Dorokartes Import Focused Auto-Safe v7");
  console.log("======================================");
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
      giftCards: { select: { officialUrl: true } },
    },
  });

  const knownDomains = new Set<string>();

  for (const d of existingDiscovery) {
    const domain = domainFromUrl(d.possibleOfficialUrl) || domainFromUrl(d.sourceUrl);
    if (domain) knownDomains.add(domain);
  }

  for (const m of production) {
    for (const u of [m.websiteUrl, ...m.giftCards.map((g) => g.officialUrl)]) {
      const d = domainFromUrl(u);
      if (d) knownDomains.add(d);
    }
  }

  const templateSource =
    existingDiscovery.find((x) => /google|serper/i.test(x.sourceName || "")) ||
    existingDiscovery[0];

  if (!templateSource) {
    throw new Error("No existing DiscoveryItem found to reuse sourceType.");
  }

  let skippedKnown = 0;
  let skippedInvalid = 0;
  let skippedManual = 0;
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

    if (MANUAL_EXCLUDE.has(domain)) {
      skippedManual++;
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
  }

  console.log(`CSV rows: ${rows.length}`);
  console.log(`Eligible new domains: ${plan.length}`);
  console.log(`Skipped already known: ${skippedKnown}`);
  console.log(`Skipped invalid: ${skippedInvalid}`);
  console.log(`Skipped manual review: ${skippedManual}`);
  console.log("");

  console.log("PLAN:");
  for (const row of plan) {
    console.log(`- ${row.domain} | ${row.merchantName} | score=${row.score}`);
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
        sourceName: "Google Serper Focused Harvest v7 AUTO_SAFE",
        sourceUrl: row.officialUrl,
        title: row.title,
        merchantName: row.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: row.officialUrl,
        notes:
          `[FOCUSED_HARVEST_V7_AUTO_SAFE]\n` +
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
