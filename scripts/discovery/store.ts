import {
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { candidateFingerprint } from "./deduplicator";
import { prisma } from "./prisma";
import type { Candidate } from "./types";

const sourceTypeMap: Record<Candidate["sourceType"], SourceType> = {
  OFFICIAL: SourceType.OFFICIAL,
  AGGREGATOR: SourceType.AGGREGATOR,
  SEARCH_ENGINE: SourceType.SEARCH_ENGINE,
  MARKETPLACE: SourceType.MARKETPLACE,
  MANUAL: SourceType.MANUAL,
  OTHER: SourceType.OTHER,
};

export async function storeCandidate(candidate: Candidate) {
  const fingerprint = candidateFingerprint(candidate);

  return prisma.discoveryItem.upsert({
    where: { fingerprint },
    update: {
      title: candidate.title ?? undefined,
      merchantName: candidate.merchantName ?? undefined,
      possibleOfficialUrl: candidate.possibleOfficialUrl ?? undefined,
      notes: candidate.notes ?? undefined,
      processedAt: null,
    },
    create: {
      sourceType: sourceTypeMap[candidate.sourceType],
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      title: candidate.title ?? undefined,
      merchantName: candidate.merchantName ?? undefined,
      possibleOfficialUrl: candidate.possibleOfficialUrl ?? undefined,
      fingerprint,
      notes: candidate.notes ?? undefined,
      status: DiscoveryStatus.DISCOVERED,
    },
  });
}

export async function storeCandidates(candidates: Candidate[]) {
  let saved = 0;

  for (const candidate of candidates) {
    await storeCandidate(candidate);
    saved++;
  }

  return saved;
}
