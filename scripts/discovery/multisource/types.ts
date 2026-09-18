export type RawDiscovery = {
  sourceType: "OFFICIAL" | "AGGREGATOR" | "SEARCH_ENGINE" | "MARKETPLACE" | "MANUAL" | "OTHER";
  sourceName: string;
  sourceUrl: string;
  title?: string | null;
  merchantName?: string | null;
  possibleOfficialUrl?: string | null;
  notes?: string | null;
};

export type NormalizedDiscovery = RawDiscovery & {
  normalizedMerchantName: string;
  normalizedSourceUrl: string;
  normalizedOfficialUrl?: string | null;
  fingerprint: string;
};
