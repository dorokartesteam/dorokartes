import "dotenv/config";
import {
  DiscoveryScanStatus,
  PrismaClient,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  discoverMerchant,
  domainOf,
  loadMerchantUniverse,
  storeCandidates,
} from "../core/official-site-discovery";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const RESCAN = process.argv.includes("--rescan");

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  if (!hit) return fallback;
  const n = Number(hit.slice(prefix.length));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const LIMIT = numberArg("limit", 10);

async function main() {
  const universe = await loadMerchantUniverse();

  const scans = await prisma.merchantDiscoveryScan.findMany({
    select: { merchantDomain: true, status: true },
  });
  const scanMap = new Map(scans.map((x) => [x.merchantDomain, x.status]));

  const production = await prisma.merchant.findMany({
    where: { websiteUrl: { not: null } },
    select: { websiteUrl: true },
  });

  const productionDomains = new Set<string>();
  for (const m of production) {
    if (!m.websiteUrl) continue;
    try { productionDomains.add(domainOf(m.websiteUrl)); } catch {}
  }

  const eligible = universe.filter((merchant) => {
    const domain = domainOf(merchant.websiteUrl);

    // Production merchants are already in the catalog and do not belong
    // in acquisition discovery.
    if (productionDomains.has(domain)) return false;

    if (RESCAN) return true;

    const status = scanMap.get(domain);
    return (
      !status ||
      status === DiscoveryScanStatus.PENDING ||
      status === DiscoveryScanStatus.ERROR
    );
  });

  const batch = eligible.slice(0, LIMIT);

  console.log("Dorokartes Scale Discovery v3.1");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Rescan: ${RESCAN}`);
  console.log(`Universe rows: ${universe.length}`);
  console.log(`Production domains skipped: ${productionDomains.size}`);
  console.log(`Previously completed scans: ${
    scans.filter((x) =>
      [
        DiscoveryScanStatus.SCANNED_NO_CANDIDATE,
        DiscoveryScanStatus.CANDIDATES_FOUND,
        DiscoveryScanStatus.BLOCKED,
      ].includes(x.status)
    ).length
  }`);
  console.log(`Eligible merchant domains: ${eligible.length}`);
  console.log(`Batch size: ${batch.length}`);
  console.log("");

  let merchantHits = 0;
  let blocked = 0;
  let pages = 0;
  let created = 0;
  let existing = 0;

  for (const merchant of batch) {
    const domain = domainOf(merchant.websiteUrl);
    console.log(`=== ${merchant.merchantName} (${domain}) ===`);

    try {
      const result = await discoverMerchant(merchant);
      pages += result.requests;

      console.log(`requests=${result.requests} blocked=${result.blocked}`);

      if (result.blocked) blocked++;

      if (result.candidates.length) {
        merchantHits++;

        for (const c of result.candidates) {
          console.log(
            `  [${c.discoveryMethod}] score=${c.score} ${c.candidateUrl}`,
          );
        }

        if (APPLY) {
          const stored = await storeCandidates(prisma, result.candidates);
          created += stored.created;
          existing += stored.existing;
        }
      } else {
        console.log("  no validated official candidate");
      }

      if (APPLY) {
        const status = result.blocked
          ? DiscoveryScanStatus.BLOCKED
          : result.candidates.length
            ? DiscoveryScanStatus.CANDIDATES_FOUND
            : DiscoveryScanStatus.SCANNED_NO_CANDIDATE;

        await prisma.merchantDiscoveryScan.upsert({
          where: { merchantDomain: domain },
          create: {
            merchantDomain: domain,
            merchantName: merchant.merchantName,
            websiteUrl: merchant.websiteUrl,
            category: merchant.category,
            status,
            candidateCount: result.candidates.length,
            requestCount: result.requests,
            lastScannedAt: new Date(),
          },
          update: {
            merchantName: merchant.merchantName,
            websiteUrl: merchant.websiteUrl,
            category: merchant.category,
            status,
            candidateCount: result.candidates.length,
            requestCount: result.requests,
            lastError: null,
            lastScannedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.log(`  ERROR ${error instanceof Error ? error.message : String(error)}`);

      if (APPLY) {
        await prisma.merchantDiscoveryScan.upsert({
          where: { merchantDomain: domain },
          create: {
            merchantDomain: domain,
            merchantName: merchant.merchantName,
            websiteUrl: merchant.websiteUrl,
            category: merchant.category,
            status: DiscoveryScanStatus.ERROR,
            lastError: error instanceof Error ? error.message : String(error),
            lastScannedAt: new Date(),
          },
          update: {
            status: DiscoveryScanStatus.ERROR,
            lastError: error instanceof Error ? error.message : String(error),
            lastScannedAt: new Date(),
          },
        });
      }
    }

    console.log("");
  }

  console.log("====================================");
  console.log(`Merchants scanned: ${batch.length}`);
  console.log(`Merchants with candidates: ${merchantHits}`);
  console.log(`Blocked domains: ${blocked}`);
  console.log(`Requests: ${pages}`);
  console.log(`DiscoveryItems created: ${created}`);
  console.log(`Existing candidates skipped: ${existing}`);

  if (!APPLY) {
    console.log("Dry run only. Scan-state checkpoint not advanced.");
    console.log(
      "Apply this SAME batch before moving on so no merchants are skipped.",
    );
  } else {
    console.log(
      "Checkpoint advanced. Next batch is simply: npm run pipeline:discover -- --limit=" +
      LIMIT,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
