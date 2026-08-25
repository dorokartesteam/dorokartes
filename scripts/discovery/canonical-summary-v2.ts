import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function domainOf(input: string) {
  try {
    const url = new URL(input);
    return (
      getDomain(url.hostname, { allowPrivateDomains: true }) ??
      url.hostname.replace(/^www\./, "")
    );
  } catch {
    return input;
  }
}

async function main() {
  const active = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      NOT: {
        sourceName: "Official Website Verifier",
      },
      status: {
        in: [DiscoveryStatus.VERIFIED, DiscoveryStatus.QUEUED],
      },
    },
    select: {
      merchantName: true,
      sourceName: true,
      sourceUrl: true,
      status: true,
      notes: true,
    },
    orderBy: {
      sourceUrl: "asc",
    },
  });

  console.log("Dorokartes Canonical v2 summary");
  console.log("");

  const byDomain = new Map<string, typeof active>();

  for (const row of active) {
    const domain = domainOf(row.sourceUrl);
    const list = byDomain.get(domain) ?? [];
    list.push(row);
    byDomain.set(domain, list);
  }

  console.log(`Active domain groups: ${byDomain.size}`);
  console.log(`Active rows: ${active.length}`);
  console.log("");

  for (const [domain, rows] of [...byDomain.entries()].sort()) {
    const flag = rows.length === 1 ? "OK" : "CHECK";

    console.log(`[${flag}] ${domain} (${rows.length})`);

    for (const row of rows) {
      console.log(
        `  [${row.status}] ${row.merchantName ?? row.sourceName} -> ${row.sourceUrl}`,
      );
    }
  }

  const duplicate = await prisma.discoveryItem.count({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: DiscoveryStatus.DUPLICATE,
    },
  });

  const rejected = await prisma.discoveryItem.count({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: DiscoveryStatus.REJECTED,
    },
  });

  console.log("");
  console.log(`DUPLICATE rows: ${duplicate}`);
  console.log(`REJECTED rows: ${rejected}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
