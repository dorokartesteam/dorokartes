import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

type Rule = {
  merchantName: string;
  possibleOfficialUrl?: string;
  allowedStatuses: DiscoveryStatus[];
  action: "QUEUE";
  note: string;
};

const RULES: Rule[] = [
  {
    merchantName: "Powerpharm",
    allowedStatuses: [DiscoveryStatus.DISCOVERED],
    action: "QUEUE",
    note: "Confirmed merchant gift-card evidence on official domain.",
  },
  {
    merchantName: "Martin Tailored",
    allowedStatuses: [DiscoveryStatus.DISCOVERED],
    action: "QUEUE",
    note: "Confirmed Gift Card category on official merchant domain.",
  },
  {
    merchantName: "Didi",
    allowedStatuses: [DiscoveryStatus.DISCOVERED],
    action: "QUEUE",
    note: "Confirmed gift-card evidence on official merchant domain.",
  },
  {
    merchantName: "Bilero",
    allowedStatuses: [DiscoveryStatus.DISCOVERED],
    action: "QUEUE",
    note: "Confirmed BILERO Virtual Gift Card on official merchant domain.",
  },
  {
    merchantName: "Netflix",
    possibleOfficialUrl: "https://www.netflix.com/gr/gift-cards",
    allowedStatuses: [DiscoveryStatus.QUEUED],
    action: "QUEUE",
    note: "Resolved to official Netflix Greece gift-card page.",
  },
  {
    merchantName: "Laura Ashley",
    possibleOfficialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
    allowedStatuses: [DiscoveryStatus.QUEUED],
    action: "QUEUE",
    note: "Resolved to official Laura Ashley Greece gift-card page.",
  },
];

function appendNote(existing: string | null, note: string) {
  const marker = `[CONFIRMED_PENDING_RESOLVER_V1] ${note}`;
  if ((existing || "").includes(marker)) return existing;
  return [existing?.trim(), marker].filter(Boolean).join("\n");
}

async function main() {
  console.log("Dorokartes Confirmed Pending Resolver v1");
  console.log("========================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("");

  let matched = 0;
  let changed = 0;
  let skipped = 0;

  for (const rule of RULES) {
    const item = await prisma.discoveryItem.findFirst({
      where: {
        merchantName: {
          equals: rule.merchantName,
          mode: "insensitive",
        },
        status: {
          in: rule.allowedStatuses,
        },
      },
      select: {
        id: true,
        merchantName: true,
        status: true,
        possibleOfficialUrl: true,
        notes: true,
      },
    });

    if (!item) {
      console.log(`SKIP | ${rule.merchantName} | no matching pending item`);
      skipped++;
      continue;
    }

    matched++;

    const nextUrl = rule.possibleOfficialUrl ?? item.possibleOfficialUrl;
    if (!nextUrl) {
      console.log(`SKIP | ${rule.merchantName} | no official URL available`);
      skipped++;
      continue;
    }

    console.log(
      `${APPLY ? "APPLY" : "PLAN"} | ${item.merchantName} | ${item.status} -> QUEUED | ${nextUrl}`
    );

    if (APPLY) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: DiscoveryStatus.QUEUED,
          possibleOfficialUrl: nextUrl,
          notes: appendNote(item.notes, rule.note),
        },
      });
      changed++;
    }
  }

  console.log("");
  console.log(`Matched: ${matched}`);
  console.log(`Changed: ${changed}`);
  console.log(`Skipped: ${skipped}`);

  if (!APPLY) {
    console.log("PLAN ONLY. No database changes were made.");
  } else {
    console.log("Done. Now run pipeline:bulk-promote PLAN again.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
