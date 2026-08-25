import "dotenv/config";
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

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      NOT: {
        sourceName: "Official Website Verifier",
      },
    },
    select: {
      merchantName: true,
      sourceName: true,
      sourceUrl: true,
      status: true,
      notes: true,
    },
    orderBy: [
      { status: "asc" },
      { merchantName: "asc" },
    ],
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }

  console.log("Dorokartes canonicalization summary");
  console.log("");

  for (const [status, count] of counts) {
    console.log(`${status}: ${count}`);
  }

  console.log("");
  console.log("Canonical/active candidates:");
  console.log("");

  for (const row of rows) {
    if (
      row.status !== DiscoveryStatus.VERIFIED &&
      row.status !== DiscoveryStatus.QUEUED
    ) {
      continue;
    }

    console.log(`[${row.status}] ${row.merchantName ?? row.sourceName}`);
    console.log(`  ${row.sourceUrl}`);
    if (row.notes) console.log(`  ${row.notes}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
