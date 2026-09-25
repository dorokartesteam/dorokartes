import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
const SEARCH_ANALYTICS_BASE =
  "https://www.googleapis.com/webmasters/v3/sites";

type PeriodMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
};

type PeriodEvidence = PeriodMetrics & {
  previous: PeriodMetrics;
  clickDelta: number | null;
  impressionDelta: number | null;
};

export type SearchConsoleDimensionRow = PeriodMetrics & {
  key: string;
};

export type SearchConsoleEvidence = {
  adapterReady: true;
  connected: boolean;
  siteUrl: string | null;
  dataThrough: string | null;
  lagDays: number;
  periods: {
    d7: PeriodEvidence | null;
    d30: PeriodEvidence | null;
    d90: PeriodEvidence | null;
  };
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  averagePosition: number | null;
  indexedPages: null;
  topQueries: SearchConsoleDimensionRow[];
  topPages: SearchConsoleDimensionRow[];
  opportunities: SearchConsoleDimensionRow[];
  branded: {
    clicks: number;
    impressions: number;
    ctr: number;
    shareOfClicks: number;
  } | null;
  nonBranded: {
    clicks: number;
    impressions: number;
    ctr: number;
    shareOfClicks: number;
  } | null;
  reason: string;
  requiredEnv: string[];
};

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchAnalyticsResponse = {
  rows?: SearchAnalyticsRow[];
};

function requiredEnvNames() {
  return [
    "GOOGLE_SEARCH_CONSOLE_SITE_URL",
    "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
    "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  ];
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function privateKey() {
  return env("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeMetrics(row?: SearchAnalyticsRow): PeriodMetrics {
  return {
    clicks: Math.round(row?.clicks ?? 0),
    impressions: Math.round(row?.impressions ?? 0),
    ctr: Math.round((row?.ctr ?? 0) * 10000) / 100,
    averagePosition: Math.round((row?.position ?? 0) * 100) / 100,
  };
}

function normalizeDimensionRow(row: SearchAnalyticsRow): SearchConsoleDimensionRow {
  return {
    key: row.keys?.[0] || "",
    ...normalizeMetrics(row),
  };
}

function share(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function aggregateRows(rows: SearchConsoleDimensionRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks;
      acc.impressions += row.impressions;
      return acc;
    },
    { clicks: 0, impressions: 0 },
  );
  return {
    ...totals,
    ctr: totals.impressions
      ? Math.round((totals.clicks / totals.impressions) * 10000) / 100
      : 0,
  };
}

async function getAccessToken() {
  const clientEmail = env("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const key = privateKey();

  if (!clientEmail || !key) {
    throw new Error("Missing Search Console service-account credentials.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const signature = base64Url(signer.sign(key));
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google OAuth failed (${response.status}): ${
        payload.error_description || payload.error || "unknown error"
      }`,
    );
  }

  return payload.access_token;
}

async function querySearchAnalytics(args: {
  token: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: Array<"query" | "page">;
  rowLimit?: number;
}) {
  const endpoint = `${SEARCH_ANALYTICS_BASE}/${encodeURIComponent(
    args.siteUrl,
  )}/searchAnalytics/query`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate: args.startDate,
      endDate: args.endDate,
      type: "web",
      aggregationType: "auto",
      dimensions: args.dimensions || [],
      rowLimit: args.rowLimit ?? 1,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as
    | SearchAnalyticsResponse
    | { error?: { message?: string; status?: string } };

  if (!response.ok) {
    const errorPayload = payload as {
      error?: { message?: string; status?: string };
    };
    throw new Error(
      `Search Console query failed (${response.status}): ${
        errorPayload.error?.message ||
        errorPayload.error?.status ||
        "unknown error"
      }`,
    );
  }

  return payload as SearchAnalyticsResponse;
}

async function queryPeriod(args: {
  token: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
}): Promise<PeriodMetrics> {
  const data = await querySearchAnalytics({ ...args, rowLimit: 1 });
  return normalizeMetrics(data.rows?.[0]);
}

async function queryDimension(args: {
  token: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimension: "query" | "page";
  rowLimit?: number;
}) {
  const data = await querySearchAnalytics({
    token: args.token,
    siteUrl: args.siteUrl,
    startDate: args.startDate,
    endDate: args.endDate,
    dimensions: [args.dimension],
    rowLimit: args.rowLimit ?? 100,
  });

  return (data.rows || [])
    .map(normalizeDimensionRow)
    .filter((row) => row.key);
}

async function getPeriodEvidence(args: {
  token: string;
  siteUrl: string;
  days: number;
  endDate: Date;
}): Promise<PeriodEvidence> {
  const currentEnd = args.endDate;
  const currentStart = shiftDays(currentEnd, -(args.days - 1));
  const previousEnd = shiftDays(currentStart, -1);
  const previousStart = shiftDays(previousEnd, -(args.days - 1));

  const [current, previous] = await Promise.all([
    queryPeriod({
      token: args.token,
      siteUrl: args.siteUrl,
      startDate: isoDate(currentStart),
      endDate: isoDate(currentEnd),
    }),
    queryPeriod({
      token: args.token,
      siteUrl: args.siteUrl,
      startDate: isoDate(previousStart),
      endDate: isoDate(previousEnd),
    }),
  ]);

  return {
    ...current,
    previous,
    clickDelta: percentChange(current.clicks, previous.clicks),
    impressionDelta: percentChange(
      current.impressions,
      previous.impressions,
    ),
  };
}

function emptyEvidence(args: {
  siteUrl: string | null;
  lagDays: number;
  reason: string;
  requiredEnv: string[];
}): SearchConsoleEvidence {
  return {
    adapterReady: true,
    connected: false,
    siteUrl: args.siteUrl,
    dataThrough: null,
    lagDays: args.lagDays,
    periods: { d7: null, d30: null, d90: null },
    clicks: null,
    impressions: null,
    ctr: null,
    averagePosition: null,
    indexedPages: null,
    topQueries: [],
    topPages: [],
    opportunities: [],
    branded: null,
    nonBranded: null,
    reason: args.reason,
    requiredEnv: args.requiredEnv,
  };
}

export async function getSearchConsoleEvidence(): Promise<SearchConsoleEvidence> {
  const requiredEnv = requiredEnvNames();
  const siteUrl = env("GOOGLE_SEARCH_CONSOLE_SITE_URL");
  const clientEmail = env("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const key = privateKey();
  const configured = Boolean(siteUrl && clientEmail && key);

  const parsedLag = Number(
    process.env.GOOGLE_SEARCH_CONSOLE_DATA_LAG_DAYS || "3",
  );
  const lagDays =
    Number.isFinite(parsedLag) && parsedLag >= 0
      ? Math.floor(parsedLag)
      : 3;

  if (!configured) {
    return emptyEvidence({
      siteUrl: siteUrl || null,
      lagDays,
      requiredEnv,
      reason:
        "Search Console integration is installed but credentials are not configured.",
    });
  }

  try {
    const token = await getAccessToken();
    const endDate = shiftDays(new Date(), -lagDays);
    const start30 = shiftDays(endDate, -29);

    const [d7, d30, d90, queryRows, pageRows] = await Promise.all([
      getPeriodEvidence({ token, siteUrl, days: 7, endDate }),
      getPeriodEvidence({ token, siteUrl, days: 30, endDate }),
      getPeriodEvidence({ token, siteUrl, days: 90, endDate }),
      queryDimension({
        token,
        siteUrl,
        startDate: isoDate(start30),
        endDate: isoDate(endDate),
        dimension: "query",
        rowLimit: 250,
      }),
      queryDimension({
        token,
        siteUrl,
        startDate: isoDate(start30),
        endDate: isoDate(endDate),
        dimension: "page",
        rowLimit: 250,
      }),
    ]);

    const brandedRows = queryRows.filter((row) =>
      /\b(dorokartes?|δωροκαρτες?|δωροκάρτες?)\b/i.test(row.key),
    );
    const nonBrandedRows = queryRows.filter(
      (row) => !brandedRows.includes(row),
    );
    const brandedTotals = aggregateRows(brandedRows);
    const nonBrandedTotals = aggregateRows(nonBrandedRows);

    const opportunities = [...queryRows]
      .filter((row) => row.impressions >= 10 && row.ctr < 3 && row.averagePosition <= 20)
      .sort(
        (a, b) =>
          b.impressions - a.impressions ||
          a.ctr - b.ctr ||
          a.averagePosition - b.averagePosition,
      )
      .slice(0, 12);

    return {
      adapterReady: true,
      connected: true,
      siteUrl,
      dataThrough: isoDate(endDate),
      lagDays,
      periods: { d7, d30, d90 },
      clicks: d30.clicks,
      impressions: d30.impressions,
      ctr: d30.ctr,
      averagePosition: d30.averagePosition,
      indexedPages: null,
      topQueries: [...queryRows]
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 12),
      topPages: [...pageRows]
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 12),
      opportunities,
      branded: {
        ...brandedTotals,
        shareOfClicks: share(brandedTotals.clicks, d30.clicks),
      },
      nonBranded: {
        ...nonBrandedTotals,
        shareOfClicks: share(nonBrandedTotals.clicks, d30.clicks),
      },
      reason:
        "Connected to Google Search Console Search Analytics API. Indexed-page totals remain unset because Search Analytics does not provide a site-wide indexed-page count.",
      requiredEnv,
    };
  } catch (error) {
    return emptyEvidence({
      siteUrl,
      lagDays,
      requiredEnv,
      reason:
        error instanceof Error
          ? error.message
          : "Unknown Search Console integration error.",
    });
  }
}
