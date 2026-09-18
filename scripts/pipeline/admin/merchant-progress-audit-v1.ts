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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const OUT = path.join(
  process.cwd(),
  "data",
  "discovery",
  "merchant-progress-audit-v1.csv",
);

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

function normalizeName(input?: string | null) {
  return (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(greece|hellas|official|eshop|e-shop|shop|store|online)\b/g, " ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function main() {
  console.log("Dorokartes Merchant Progress Audit v1");
  console.log("=====================================");
  console.log("READ ONLY: yes");
  console.log("");

  const discovery = await prisma.discoveryItem.findMany({
    where: {
      status: {
        in: [
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFIED,
        ],
      },
    },
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      sourceName: true,
      status: true,
      notes: true,
    },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: {
          officialUrl: true,
        },
      },
    },
  });

  const prodDomains = new Set<string>();
  const prodNames = new Set<string>();

  for (const m of production) {
    const n = normalizeName(m.name);
    if (n) prodNames.add(n);

    if (m.websiteUrl) {
      const d = domainFromUrl(m.websiteUrl);
      if (d) prodDomains.add(d);
    }

    for (const g of m.giftCards) {
      if (!g.officialUrl) continue;
      const d = domainFromUrl(g.officialUrl);
      if (d) prodDomains.add(d);
    }
  }

  const byStatus: Record<string, number> = {};
  for (const s of Object.values(DiscoveryStatus)) byStatus[s] = 0;
  for (const item of discovery) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;

  const uniqueOfficialDomains = new Set<string>();
  const uniqueAcceptedDomains = new Set<string>();
  const uniqueVerifiedDomains = new Set<string>();
  const uniqueDiscoveredDomains = new Set<string>();

  const rows: Record<string, unknown>[] = [];
  const dedupeKeySeen = new Set<string>();

  let withoutOfficialUrl = 0;
  let overlapsProduction = 0;

  for (const item of discovery) {
    const officialDomain = domainFromUrl(item.possibleOfficialUrl);
    const normalizedName = normalizeName(item.merchantName);

    if (!officialDomain) {
      withoutOfficialUrl++;
    } else {
      uniqueOfficialDomains.add(officialDomain);
      if (item.status === DiscoveryStatus.QUEUED) uniqueAcceptedDomains.add(officialDomain);
      if (item.status === DiscoveryStatus.VERIFIED) uniqueVerifiedDomains.add(officialDomain);
      if (item.status === DiscoveryStatus.DISCOVERED) uniqueDiscoveredDomains.add(officialDomain);
    }

    const overlaps =
      (!!officialDomain && prodDomains.has(officialDomain)) ||
      (!!normalizedName && prodNames.has(normalizedName));

    if (overlaps) overlapsProduction++;

    const canonicalKey =
      officialDomain ||
      (normalizedName ? `name:${normalizedName}` : `id:${item.id}`);

    if (dedupeKeySeen.has(canonicalKey)) continue;
    dedupeKeySeen.add(canonicalKey);

    rows.push({
      canonical_key: canonicalKey,
      merchant_name: item.merchantName,
      official_domain: officialDomain,
      status: item.status,
      source_name: item.sourceName,
      overlaps_production: overlaps ? "YES" : "NO",
    });
  }

  const uniqueDiscoveryCandidates = dedupeKeySeen.size;
  const combinedEstimate =
    production.length +
    rows.filter((r) => r.overlaps_production === "NO").length;

  const acceptedRows = rows.filter((r) => r.status === DiscoveryStatus.QUEUED);
  const verifiedRows = rows.filter((r) => r.status === DiscoveryStatus.VERIFIED);

  console.log(`Production merchants: ${production.length}`);
  console.log(`Active discovery records: ${discovery.length}`);
  console.log("");
  console.log("Discovery status counts:");
  console.log(`- DISCOVERED: ${byStatus[DiscoveryStatus.DISCOVERED] ?? 0}`);
  console.log(`- QUEUED / accepted: ${byStatus[DiscoveryStatus.QUEUED] ?? 0}`);
  console.log(`- VERIFIED: ${byStatus[DiscoveryStatus.VERIFIED] ?? 0}`);
  console.log("");
  console.log(`Unique discovery merchant candidates: ${uniqueDiscoveryCandidates}`);
  console.log(`Unique official domains: ${uniqueOfficialDomains.size}`);
  console.log(`Unique accepted/QUEUED domains: ${uniqueAcceptedDomains.size}`);
  console.log(`Unique VERIFIED domains: ${uniqueVerifiedDomains.size}`);
  console.log(`Unique still-DISCOVERED domains: ${uniqueDiscoveredDomains.size}`);
  console.log(`Records without possibleOfficialUrl: ${withoutOfficialUrl}`);
  console.log(`Discovery records overlapping production: ${overlapsProduction}`);
  console.log("");
  console.log(`Distinct accepted candidate rows: ${acceptedRows.length}`);
  console.log(`Distinct verified candidate rows: ${verifiedRows.length}`);
  console.log(`Estimated combined distinct merchants incl. production: ${combinedEstimate}`);
  console.log(`Distance to 800 target: ${Math.max(0, 800 - combinedEstimate)}`);
  console.log("");
  console.log("IMPORTANT:");
  console.log("QUEUED means accepted for pipeline review, not yet production.");
  console.log("Only VERIFIED/canonicalized candidates should be promoted into Merchant/GiftCard.");
  console.log("");

  writeCsv(OUT, rows, [
    "canonical_key",
    "merchant_name",
    "official_domain",
    "status",
    "source_name",
    "overlaps_production",
  ]);

  console.log(`CSV: ${OUT}`);
  console.log("No database changes were made.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
