import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const mappings = [
  {
    merchantName: "Notos",
    url: "https://www.notos.gr/e-gift-cards-purchase/",
    note: "Official Greek consumer e-gift card purchase page.",
  },
  {
    merchantName: "Kotsovolos",
    url: "https://kotsovolos-b2b.giftcards-store.com/el",
    note: "Official Kotsovolos corporate digital gift-card platform for Greece.",
  },
];

async function main() {
  console.log("Dorokartes Kouponia365 Fast Resolver v4");
  console.log("======================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  let changed = 0;
  let matched = 0;

  for (const m of mappings) {
    const rows = await prisma.discoveryItem.findMany({
      where: {
        sourceName: "Kouponia365 Gift Cards",
        merchantName: m.merchantName,
      },
      select: {
        id: true,
        merchantName: true,
        possibleOfficialUrl: true,
        status: true,
        notes: true,
      },
    });

    if (!rows.length) {
      console.log(`[NOT FOUND] ${m.merchantName}`);
      continue;
    }

    for (const row of rows) {
      matched++;

      if (row.possibleOfficialUrl) {
        console.log(`[SKIP HAS URL] ${m.merchantName} -> ${row.possibleOfficialUrl}`);
        continue;
      }

      console.log(`[RESOLVE] ${m.merchantName} -> ${m.url}`);

      if (APPLY) {
        await prisma.discoveryItem.update({
          where: { id: row.id },
          data: {
            possibleOfficialUrl: m.url,
            status:
              row.status === DiscoveryStatus.DISCOVERED
                ? DiscoveryStatus.QUEUED
                : row.status,
            notes: [
              row.notes || "",
              m.note,
              "Resolved manually from official public evidence. No OpenAI/API call.",
            ].filter(Boolean).join(" | "),
          },
        });
        changed++;
      }
    }
  }

  const remaining = await prisma.discoveryItem.findMany({
    where: {
      sourceName: "Kouponia365 Gift Cards",
      possibleOfficialUrl: null,
    },
    select: { merchantName: true },
    orderBy: { merchantName: "asc" },
  });

  console.log("");
  console.log("======================================");
  console.log(`Mappings available: ${mappings.length}`);
  console.log(`Rows matched: ${matched}`);
  console.log(`Rows changed: ${changed}`);
  console.log(`Still unresolved: ${remaining.length}`);

  for (const r of remaining) {
    console.log(`  - ${r.merchantName ?? "UNKNOWN"}`);
  }

  console.log("OpenAI/API calls: 0");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
