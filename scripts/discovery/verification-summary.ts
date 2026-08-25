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
  const official = await prisma.discoveryItem.findMany({
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

  console.log("Dorokartes OFFICIAL source summary");
  console.log("");

  const counts = new Map<string, number>();

  for (const item of official) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  for (const [status, count] of counts) {
    console.log(`${status}: ${count}`);
  }

  console.log("");
  console.log("Official rows:");
  console.log("");

  for (const item of official) {
    console.log(`[${item.status}] ${item.merchantName ?? item.sourceName}`);
    console.log(`  ${item.sourceUrl}`);
    if (item.notes) console.log(`  ${item.notes}`);
  }

  const scannerRows = await prisma.discoveryItem.count({
    where: {
      sourceName: "Official Website Verifier",
    },
  });

  console.log("");
  console.log(`Broad-scanner rows still present: ${scannerRows}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
