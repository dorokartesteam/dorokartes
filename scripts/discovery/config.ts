export const DISCOVERY_CONFIG = {
  userAgent:
    "DorokartesBot/0.2 (+https://dorokartes.gr; discovery verifier)",

  requestTimeoutMs: 10_000,

  // Hard stop for a whole merchant/domain scan.
  domainTimeoutMs: 45_000,

  // Number of domains scanned in parallel.
  domainConcurrency: 3,

  // Number of pages from the same domain scanned in parallel.
  pageConcurrency: 3,

  perHostDelayMs: 350,

  // Keep verification fast. We are looking for gift-card evidence,
  // not crawling the entire website.
  maxPagesPerDomain: 20,

  // Avoid giant ecommerce sitemap trees blocking the verifier.
  maxSitemapUrls: 1500,
  maxSitemapFiles: 15,

  minScoreToStore: 45,
} as const;
