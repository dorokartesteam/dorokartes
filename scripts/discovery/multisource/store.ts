import {
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import type { NormalizedDiscovery } from "./types";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const sourceTypeMap: Record<
  NormalizedDiscovery["sourceType"],
  SourceType
> = {
  OFFICIAL: SourceType.OFFICIAL,
  AGGREGATOR: SourceType.AGGREGATOR,
  SEARCH_ENGINE: SourceType.SEARCH_ENGINE,
  MARKETPLACE: SourceType.MARKETPLACE,
  MANUAL: SourceType.MANUAL,
  OTHER: SourceType.OTHER,
};

export async function storeNormalized(items: NormalizedDiscovery[]) {
  let saved = 0;

  for (const item of items) {
    await prisma.discoveryItem.upsert({
      where: { fingerprint: item.fingerprint },
      update: {
        sourceType: sourceTypeMap[item.sourceType],
        sourceName: item.sourceName,
        sourceUrl: item.normalizedSourceUrl,
        title: item.title ?? undefined,
        merchantName: item.merchantName ?? undefined,
        possibleOfficialUrl: item.normalizedOfficialUrl ?? undefined,
        notes: item.notes ?? undefined,
        processedAt: null,
      },
      create: {
        sourceType: sourceTypeMap[item.sourceType],
        sourceName: item.sourceName,
        sourceUrl: item.normalizedSourceUrl,
        title: item.title ?? undefined,
        merchantName: item.merchantName ?? undefined,
        possibleOfficialUrl: item.normalizedOfficialUrl ?? undefined,
        fingerprint: item.fingerprint,
        notes: item.notes ?? undefined,
        status: DiscoveryStatus.DISCOVERED,
      },
    });

    saved++;
  }

  return saved;
}

export async function disconnect() {
  await prisma.$disconnect();
}
