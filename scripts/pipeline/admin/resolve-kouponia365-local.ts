import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

function norm(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function badAggregatorUrl(url: string | null | undefined) {
  if (!url) return true;

  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "kouponia365.gr" ||
      host.endsWith(".kouponia365.gr") ||
      host === "bestprice.gr" ||
      host.endsWith(".bestprice.gr")
    );
  } catch {
    return true;
  }
}

async function main() {
  console.log("Dorokartes Kouponia365 Local Resolver v1");
  console.log("=======================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  const targets = await prisma.discoveryItem.findMany({
    where: {
      sourceName: "Kouponia365 Gift Cards",
      possibleOfficialUrl: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      merchantName: true,
      title: true,
      status: true,
      possibleOfficialUrl: true,
    },
  });

  const production = await prisma.merchant.findMany({
    include: {
      giftCards: {
        where: {
          officialUrl: { not: null },
        },
        select: {
          officialUrl: true,
          status: true,
          verificationStatus: true,
        },
      },
    },
  });

  const evidence = await prisma.discoveryItem.findMany({
    where: {
      possibleOfficialUrl: { not: null },
      NOT: {
        sourceName: "Kouponia365 Gift Cards",
      },
    },
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      status: true,
      sourceName: true,
    },
  });

  const prodByName = new Map<string, string>();

  for (const merchant of production) {
    const key = norm(merchant.name);
    if (!key) continue;

    const official =
      merchant.giftCards
        .map((g) => g.officialUrl)
        .find((u): u is string => Boolean(u) && !badAggregatorUrl(u)) || "";

    if (official) prodByName.set(key, official);
  }

  const evidenceByName = new Map<string, string>();

  for (const item of evidence) {
    const key = norm(item.merchantName);
    const url = item.possibleOfficialUrl;

    if (!key || !url || badAggregatorUrl(url)) continue;

    if (!evidenceByName.has(key)) {
      evidenceByName.set(key, url);
    }
  }

  let resolvedProduction = 0;
  let resolvedEvidence = 0;
  let unresolved = 0;

  for (const item of targets) {
    const name = item.merchantName || item.title || "";
    const key = norm(name);

    let url = "";
    let source = "";

    if (key && prodByName.has(key)) {
      url = prodByName.get(key)!;
      source = "PRODUCTION";
      resolvedProduction++;
    } else if (key && evidenceByName.has(key)) {
      url = evidenceByName.get(key)!;
      source = "EXISTING_DISCOVERY";
      resolvedEvidence++;
    } else {
      unresolved++;
      console.log(`[UNRESOLVED] ${name}`);
      continue;
    }

    console.log(`[RESOLVED:${source}] ${name} -> ${url}`);

    if (APPLY) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          possibleOfficialUrl: url,
          status:
            item.status === DiscoveryStatus.DISCOVERED
              ? DiscoveryStatus.QUEUED
              : item.status,
          notes: {
            set: [
              "Resolved locally without OpenAI/API cost.",
              `Resolution source: ${source}.`,
              `Resolved URL: ${url}`,
            ].join(" | "),
          },
        },
      });
    }
  }

  console.log("");
  console.log("=======================================");
  console.log(`Kouponia365 targets without URL: ${targets.length}`);
  console.log(`Resolved from production: ${resolvedProduction}`);
  console.log(`Resolved from existing discovery: ${resolvedEvidence}`);
  console.log(`Still unresolved: ${unresolved}`);
  console.log(`OpenAI/API calls: 0`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
