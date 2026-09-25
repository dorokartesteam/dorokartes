export type SearchConsoleEvidence = {
  adapterReady: true;
  connected: false;
  clicks: null;
  impressions: null;
  ctr: null;
  averagePosition: null;
  indexedPages: null;
  reason: string;
  requiredEnv: string[];
};

export async function getSearchConsoleEvidence(): Promise<SearchConsoleEvidence> {
  const requiredEnv = [
    "GOOGLE_SEARCH_CONSOLE_SITE_URL",
    "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
    "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  ];

  return {
    adapterReady: true,
    connected: false,
    clicks: null,
    impressions: null,
    ctr: null,
    averagePosition: null,
    indexedPages: null,
    reason:
      "Search Console API is not wired in the current project snapshot. The dashboard keeps Google metrics null until a real API source is connected.",
    requiredEnv,
  };
}
