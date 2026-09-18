import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceName: "External Search Discovery",
      status: {
        in: [
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFIED,
          DiscoveryStatus.REJECTED,
        ],
      },
    },
    orderBy: { discoveredAt: "asc" },
  });

  console.log(`Search-assisted candidates: ${rows.length}`);
  console.log("");

  for (const row of rows) {
    let meta: any = {};
    try {
      meta = row.notes ? JSON.parse(row.notes) : {};
    } catch {}

    console.log(`[${row.status}] ${row.merchantName ?? row.sourceName}`);
    console.log(`  candidate: ${row.sourceUrl}`);
    console.log(`  expected role: ${meta.expectedRole ?? "-"}`);
    console.log(`  evidence kind: ${meta.evidenceKind ?? "-"}`);
    console.log(`  evidence URL: ${meta.evidenceUrl ?? "-"}`);
    console.log(`  evidence: ${meta.evidenceSummary ?? "-"}`);
  }
}

main().finally(async () => prisma.$disconnect());
