export type Candidate = {
  sourceType:
    | "OFFICIAL"
    | "AGGREGATOR"
    | "SEARCH_ENGINE"
    | "MARKETPLACE"
    | "MANUAL"
    | "OTHER";
  sourceName: string;
  sourceUrl: string;
  title?: string | null;
  merchantName?: string | null;
  possibleOfficialUrl?: string | null;
  notes?: string | null;
  score?: number;
  matchedKeywords?: string[];
};

export type ScanResult = {
  domain: string;
  candidates: Candidate[];
  pagesChecked: number;
  errors: string[];
};
