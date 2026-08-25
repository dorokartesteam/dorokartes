import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: { sourceName: "Mass Discovery v2" },
    select: {
      merchantName: true,
      sourceUrl: true,
      status: true,
      notes: true,
    },
    orderBy: [{ merchantName: "asc" }, { sourceUrl: "asc" }],
  });

  const merchants = new Set(rows.map(r => r.merchantName).filter(Boolean));

  console.log(`Mass Discovery v2 DB Summary`);
  console.log(`Merchants represented: ${merchants.size}`);
  console.log(`Rows: ${rows.length}`);
  console.log("");

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  for (const [status,count] of counts) console.log(`${status}: ${count}`);

  console.log("");
  for (const r of rows) {
    console.log(`[${r.status}] ${r.merchantName} -> ${r.sourceUrl}`);
  }

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
