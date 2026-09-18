import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  domainOf,
  loadMerchantUniverse,
  knownDomains,
} from "../core/official-site-discovery";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const universe = await loadMerchantUniverse();
  const known = await knownDomains(prisma);

  const [production, queued, verified, rejected] = await Promise.all([
    prisma.merchant.count(),
    prisma.discoveryItem.count({
      where: { status: DiscoveryStatus.QUEUED },
    }),
    prisma.discoveryItem.count({
      where: { status: DiscoveryStatus.VERIFIED },
    }),
    prisma.discoveryItem.count({
      where: { status: DiscoveryStatus.REJECTED },
    }),
  ]);

  const universeDomains = new Set<string>();
  for (const m of universe) {
    try { universeDomains.add(domainOf(m.websiteUrl)); } catch {}
  }

  const unscanned = [...universeDomains].filter((d) => !known.has(d));

  console.log("Dorokartes Discovery Scale Summary");
  console.log("=================================");
  console.log(`Production merchants: ${production}`);
  console.log(`Universe domains: ${universeDomains.size}`);
  console.log(`Known/active domains: ${known.size}`);
  console.log(`Universe domains still eligible: ${unscanned.length}`);
  console.log(`Queued DiscoveryItems: ${queued}`);
  console.log(`Verified DiscoveryItems: ${verified}`);
  console.log(`Rejected DiscoveryItems: ${rejected}`);
  console.log("");
  console.log("Target production merchants: 800");
  console.log(`Remaining to target: ${Math.max(0, 800 - production)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
