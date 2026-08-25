import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function domainOf(url: string) {
  const u = new URL(url);
  return getDomain(u.hostname, { allowPrivateDomains: true })
    ?? u.hostname.replace(/^www\./, "");
}

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [DiscoveryStatus.VERIFIED, DiscoveryStatus.QUEUED],
      },
      NOT: {
        sourceName: "Official Website Verifier",
      },
    },
    select: {
      merchantName: true,
      sourceUrl: true,
      status: true,
    },
    orderBy: { sourceUrl: "asc" },
  });

  const groups = new Map<string, typeof rows>();

  for (const row of rows) {
    const d = domainOf(row.sourceUrl);
    const list = groups.get(d) ?? [];
    list.push(row);
    groups.set(d, list);
  }

  console.log(`Active domain groups: ${groups.size}`);
  console.log(`Active canonical rows: ${rows.length}`);
  console.log("");

  for (const [domain, items] of [...groups.entries()].sort()) {
    console.log(`[${items.length === 1 ? "OK" : "CHECK"}] ${domain}`);
    for (const item of items) {
      console.log(`  [${item.status}] ${item.merchantName ?? ""} -> ${item.sourceUrl}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
