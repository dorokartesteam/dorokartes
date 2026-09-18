import { normalizeDiscovery } from "./normalize";
import type { RawDiscovery, NormalizedDiscovery } from "./types";

function merchantKey(item: NormalizedDiscovery): string {
  return item.normalizedMerchantName || item.normalizedOfficialUrl || item.normalizedSourceUrl;
}

function mergePriority(sourceType: RawDiscovery["sourceType"]) {
  switch (sourceType) {
    case "OFFICIAL":
      return 100;
    case "AGGREGATOR":
      return 80;
    case "MARKETPLACE":
      return 70;
    case "SEARCH_ENGINE":
      return 60;
    case "MANUAL":
      return 50;
    default:
      return 10;
  }
}

export function dedupeDiscoveries(items: RawDiscovery[]) {
  const normalized = items.map(normalizeDiscovery);

  const byFingerprint = new Map<string, NormalizedDiscovery>();

  for (const item of normalized) {
    if (!byFingerprint.has(item.fingerprint)) {
      byFingerprint.set(item.fingerprint, item);
    }
  }

  const mergedByMerchant = new Map<string, NormalizedDiscovery>();

  for (const item of byFingerprint.values()) {
    const key = merchantKey(item);
    const existing = mergedByMerchant.get(key);

    if (!existing) {
      mergedByMerchant.set(key, item);
      continue;
    }

    const winner =
      mergePriority(item.sourceType) > mergePriority(existing.sourceType)
        ? item
        : existing;

    const loser = winner === item ? existing : item;

    mergedByMerchant.set(key, {
      ...winner,
      title: winner.title ?? loser.title,
      merchantName: winner.merchantName ?? loser.merchantName,
      possibleOfficialUrl:
        winner.possibleOfficialUrl ?? loser.possibleOfficialUrl,
      notes: [winner.notes, loser.notes].filter(Boolean).join(" | "),
    });
  }

  return [...mergedByMerchant.values()];
}
