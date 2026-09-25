import { prisma } from "@/lib/prisma";
import { MERCHANT_PLAN_DETAILS } from "@/lib/merchant/plans";
import { CATEGORY_LANDING_SLUGS } from "@/lib/public/category-landing-content";
import {
  OCCASION_LANDING_SLUGS,
  isOccasionLandingReadyForIndexing,
} from "@/lib/public/occasion-landing-content";
import { getSearchConsoleEvidence } from "@/lib/admin/search-console";

const DAY = 86_400_000;

function percent(current: number, total: number) {
  if (!total) return 0;
  return Math.round((current / total) * 1000) / 10;
}

function change(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function planPrice(plan: string) {
  if (plan === "PARTNER") return MERCHANT_PLAN_DETAILS.PARTNER.priceCents;
  if (plan === "FEATURED") return MERCHANT_PLAN_DETAILS.FEATURED.priceCents;
  if (plan === "PREMIUM_BANNER") return MERCHANT_PLAN_DETAILS.PREMIUM_BANNER.priceCents;
  return 0;
}

type QueryRow = { query: string; resultsCount: number; searchedAt: Date };

function aggregateQueries(rows: QueryRow[], zeroOnly = false) {
  const map = new Map<string, { query: string; count: number; zeroResults: number }>();

  for (const row of rows) {
    if (zeroOnly && row.resultsCount !== 0) continue;
    const raw = row.query.trim();
    if (!raw) continue;
    const key = raw.toLocaleLowerCase("el-GR");
    const item = map.get(key) || { query: raw, count: 0, zeroResults: 0 };
    item.count += 1;
    if (row.resultsCount === 0) item.zeroResults += 1;
    map.set(key, item);
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.zeroResults - a.zeroResults ||
        a.query.localeCompare(b.query, "el"),
    )
    .slice(0, 10);
}

export async function getGrowthEvidenceData() {
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since14 = new Date(now.getTime() - 14 * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);
  const since180 = new Date(now.getTime() - 180 * DAY);

  const readyOccasionSlugs = OCCASION_LANDING_SLUGS.filter(
    isOccasionLandingReadyForIndexing,
  );

  const [
    activeCards,
    verifiedCards,
    activeMerchants,
    indexableMerchants,
    indexableCategories,
    indexableOccasions,

    views7,
    viewsPrevious7,
    views30,
    viewsPrevious30,
    views90,
    viewsPrevious90,

    clicks7,
    clicksPrevious7,
    clicks30,
    clicksPrevious30,
    clicks90,
    clicksPrevious90,

    searches7,
    searchesPrevious7,
    searches30,
    searchesPrevious30,
    searches90,
    searchesPrevious90,
    searchRows,

    leadsTotal,
    leadsApproved,
    leads30,
    leadsPrevious30,
    portalActiveMerchants,
    activeSubscriptions,

    premiumAggregate,
    searchConsole,
  ] = await Promise.all([
    prisma.giftCard.count({ where: { status: "ACTIVE" } }),
    prisma.giftCard.count({
      where: { status: "ACTIVE", verificationStatus: "VERIFIED" },
    }),
    prisma.merchant.count({ where: { status: "ACTIVE" } }),
    prisma.merchant.count({
      where: {
        status: "ACTIVE",
        giftCards: {
          some: { status: "ACTIVE", verificationStatus: "VERIFIED" },
        },
      },
    }),
    prisma.category.count({
      where: {
        active: true,
        slug: { in: [...CATEGORY_LANDING_SLUGS] },
        giftCards: { some: { giftCard: { status: "ACTIVE" } } },
      },
    }),
    prisma.occasion.count({
      where: {
        active: true,
        slug: { in: readyOccasionSlugs },
        giftCards: { some: { giftCard: { status: "ACTIVE" } } },
      },
    }),

    prisma.catalogViewEvent.count({ where: { viewedAt: { gte: since7 } } }),
    prisma.catalogViewEvent.count({
      where: { viewedAt: { gte: since14, lt: since7 } },
    }),
    prisma.catalogViewEvent.count({ where: { viewedAt: { gte: since30 } } }),
    prisma.catalogViewEvent.count({
      where: { viewedAt: { gte: since60, lt: since30 } },
    }),
    prisma.catalogViewEvent.count({ where: { viewedAt: { gte: since90 } } }),
    prisma.catalogViewEvent.count({
      where: { viewedAt: { gte: since180, lt: since90 } },
    }),

    prisma.outboundClick.count({ where: { clickedAt: { gte: since7 } } }),
    prisma.outboundClick.count({
      where: { clickedAt: { gte: since14, lt: since7 } },
    }),
    prisma.outboundClick.count({ where: { clickedAt: { gte: since30 } } }),
    prisma.outboundClick.count({
      where: { clickedAt: { gte: since60, lt: since30 } },
    }),
    prisma.outboundClick.count({ where: { clickedAt: { gte: since90 } } }),
    prisma.outboundClick.count({
      where: { clickedAt: { gte: since180, lt: since90 } },
    }),

    prisma.searchEvent.count({ where: { searchedAt: { gte: since7 } } }),
    prisma.searchEvent.count({
      where: { searchedAt: { gte: since14, lt: since7 } },
    }),
    prisma.searchEvent.count({ where: { searchedAt: { gte: since30 } } }),
    prisma.searchEvent.count({
      where: { searchedAt: { gte: since60, lt: since30 } },
    }),
    prisma.searchEvent.count({ where: { searchedAt: { gte: since90 } } }),
    prisma.searchEvent.count({
      where: { searchedAt: { gte: since180, lt: since90 } },
    }),
    prisma.searchEvent.findMany({
      where: { searchedAt: { gte: since30 } },
      select: { query: true, resultsCount: true, searchedAt: true },
      orderBy: { searchedAt: "desc" },
      take: 5000,
    }),

    prisma.merchantLead.count(),
    prisma.merchantLead.count({ where: { status: "APPROVED" } }),
    prisma.merchantLead.count({ where: { createdAt: { gte: since30 } } }),
    prisma.merchantLead.count({
      where: { createdAt: { gte: since60, lt: since30 } },
    }),
    prisma.merchant.count({
      where: { members: { some: { status: "ACTIVE" } } },
    }),
    prisma.merchantSubscription.findMany({
      where: { status: "ACTIVE" },
      select: { plan: true, merchantId: true },
    }),

    prisma.premiumPlacement.aggregate({
      _sum: { impressions: true, clicks: true },
      _count: { _all: true },
    }),
    getSearchConsoleEvidence(),
  ]);

  const paidMerchantIds = new Set(activeSubscriptions.map((row) => row.merchantId));
  const mrrCents = activeSubscriptions.reduce(
    (sum, row) => sum + planPrice(row.plan),
    0,
  );
  const arrCents = mrrCents * 12;

  // Mirrors app/sitemap.ts: 5 static URLs + eligible dynamic routes.
  const indexablePages =
    5 +
    verifiedCards +
    indexableMerchants +
    indexableCategories +
    indexableOccasions;

  const zeroResultSearches = searchRows.filter(
    (row) => row.resultsCount === 0,
  ).length;

  return {
    generatedAt: now,
    catalog: {
      activeCards,
      verifiedCards,
      verifiedCoverage: percent(verifiedCards, activeCards),
      activeMerchants,
      indexableMerchants,
      indexableCategories,
      indexableOccasions,
      indexablePages,
      indexedPages: searchConsole.indexedPages,
    },
    traffic: {
      views: {
        d7: views7,
        d30: views30,
        d90: views90,
        delta7: change(views7, viewsPrevious7),
        delta30: change(views30, viewsPrevious30),
        delta90: change(views90, viewsPrevious90),
      },
      clicks: {
        d7: clicks7,
        d30: clicks30,
        d90: clicks90,
        delta7: change(clicks7, clicksPrevious7),
        delta30: change(clicks30, clicksPrevious30),
        delta90: change(clicks90, clicksPrevious90),
      },
      searches: {
        d7: searches7,
        d30: searches30,
        d90: searches90,
        delta7: change(searches7, searchesPrevious7),
        delta30: change(searches30, searchesPrevious30),
        delta90: change(searches90, searchesPrevious90),
      },
      zeroResultSearches,
      zeroResultRate: percent(zeroResultSearches, searches30),
    },
    acquisition: {
      leadsTotal,
      leadsApproved,
      leads30,
      leadsChange30: change(leads30, leadsPrevious30),
      portalActiveMerchants,
      paidMerchants: paidMerchantIds.size,
      activeSubscriptions: activeSubscriptions.length,
      funnel: {
        leadToApproved: percent(leadsApproved, leadsTotal),
        approvedToPortal: percent(portalActiveMerchants, leadsApproved),
        portalToPaid: percent(paidMerchantIds.size, portalActiveMerchants),
        leadToPaid: percent(paidMerchantIds.size, leadsTotal),
      },
    },
    revenue: {
      mrrCents,
      arrCents,
    },
    premium: {
      placements: premiumAggregate._count._all,
      impressions: premiumAggregate._sum.impressions ?? 0,
      clicks: premiumAggregate._sum.clicks ?? 0,
      ctr: percent(
        premiumAggregate._sum.clicks ?? 0,
        premiumAggregate._sum.impressions ?? 0,
      ),
      period: "lifetime" as const,
    },
    topQueries: aggregateQueries(searchRows),
    zeroResultQueries: aggregateQueries(searchRows, true),
    integrations: {
      firstPartyViews: true,
      gaConfigured: Boolean(
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim(),
      ),
      searchConsole,
    },
  };
}
