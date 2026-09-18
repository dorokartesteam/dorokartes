import "dotenv/config";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const TARGETS = [
  {
    merchantName: "EA Bags",
    domain: "eabags.gr",
    possibleOfficialUrl: "https://eabags.gr/giftcard/",
    title: "EA Bags Gift Card",
  },
  {
    merchantName: "Koumoulia",
    domain: "koumoulia.gr",
    possibleOfficialUrl: "https://www.koumoulia.gr/en/",
    title: "Koumoulia Gift Card",
  },
  {
    merchantName: "Proteas Blu Resort",
    domain: "proteasbluresort.gr",
    possibleOfficialUrl: "https://www.proteasbluresort.gr/",
    title: "Proteas Blu Resort Gift Card",
  },
];

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function main() {
  console.log("Dorokartes Manual Three Pack v1");
  console.log("===============================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("");

  const existing = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      status: true,
      sourceType: true,
      sourceName: true,
    },
  });

  const templateSource =
    existing.find((x) => /google|serper/i.test(x.sourceName || "")) ||
    existing[0];

  if (!templateSource) {
    throw new Error("No existing DiscoveryItem found to reuse sourceType.");
  }

  const plan: any[] = [];

  for (const target of TARGETS) {
    const existingMatch = existing.find((row) => {
      const d1 = domainFromUrl(row.possibleOfficialUrl);
      const d2 = domainFromUrl(row.sourceUrl);
      return d1 === target.domain || d2 === target.domain;
    });

    if (existingMatch) {
      plan.push({
        ...target,
        action: "UPDATE_EXISTING",
        id: existingMatch.id,
        currentStatus: existingMatch.status,
      });
    } else {
      plan.push({
        ...target,
        action: "CREATE_NEW",
      });
    }
  }

  for (const row of plan) {
    console.log(
      `- ${row.domain} | ${row.merchantName} | ${row.action}` +
      (row.currentStatus ? ` | current=${row.currentStatus}` : "")
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  let created = 0;
  let updated = 0;

  for (const row of plan) {
    if (row.action === "UPDATE_EXISTING") {
      await prisma.discoveryItem.update({
        where: { id: row.id },
        data: {
          merchantName: row.merchantName,
          title: row.title,
          possibleOfficialUrl: row.possibleOfficialUrl,
          status: DiscoveryStatus.QUEUED,
          notes: {
            set:
              `[MANUAL_THREE_PACK_V1]\n` +
              `Confirmed for promotion\n` +
              `Domain=${row.domain}`,
          },
        },
      });
      updated++;
    } else {
      await prisma.discoveryItem.create({
        data: {
          sourceType: templateSource.sourceType,
          sourceName: "Manual Three Pack v1",
          sourceUrl: row.possibleOfficialUrl,
          title: row.title,
          merchantName: row.merchantName,
          status: DiscoveryStatus.QUEUED,
          possibleOfficialUrl: row.possibleOfficialUrl,
          notes:
            `[MANUAL_THREE_PACK_V1]\n` +
            `Confirmed for promotion\n` +
            `Domain=${row.domain}`,
        },
      });
      created++;
    }
  }

  console.log("");
  console.log(`Created: ${created}`);
  console.log(`Updated existing: ${updated}`);
  console.log("All targets are now QUEUED.");
  console.log("Next: npm run pipeline:bulk-promote");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
