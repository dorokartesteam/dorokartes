export type SeedMerchant = {
  merchantName: string;
  websiteUrl: string;
  category?: string;
};

export type FoundCandidate = {
  merchantName: string;
  merchantWebsite: string;
  domain: string;
  category?: string;
  candidateUrl: string;
  candidateTitle?: string;
  discoveryMethod: "SITEMAP" | "HOMEPAGE_LINK" | "KNOWN_PATH";
  score: number;
  reasons: string[];
};
