import { prisma } from "@/lib/prisma";
import { getReadinessData } from "@/lib/admin/readiness";

const db = prisma as any;

export async function getLaunchDashboardData() {
  const [{ items, summary }, merchants, discovery, categories, occasions, featured] = await Promise.all([
    getReadinessData(),
    db.merchant.count({ where: { status: "ACTIVE" } }),
    db.discoveryItem.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { giftCards: true } },
      },
    }),
    db.occasion.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { giftCards: true } },
      },
    }),
    db.giftCard.findMany({
      where: { featured: true, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }],
      take: 24,
      select: {
        id: true,
        title: true,
        officialUrl: true,
        verificationStatus: true,
        merchant: { select: { name: true } },
        _count: {
          select: {
            categories: true,
            occasions: true,
            mediaAssets: true,
            variants: true,
          },
        },
      },
    }),
  ]);

  const discoveryMap = Object.fromEntries(
    discovery.map((x: any) => [x.status, x._count?._all ?? 0])
  );

  const readiness = {
    ...summary,
    readyPct: summary.total ? Math.round((summary.ready / summary.total) * 100) : 0,
    avgScore: items.length
      ? Math.round(items.reduce((sum: number, x: any) => sum + x.score, 0) / items.length)
      : 0,
  };

  const topIssues = [
    ["Missing media", summary.missingMedia],
    ["Missing SEO", summary.missingSeo],
    ["Missing occasion", summary.missingOccasion],
    ["Missing category", summary.missingCategory],
    ["Missing variant", summary.missingVariant],
    ["Missing description", summary.missingDescription],
    ["Unverified", summary.unverified],
  ].sort((a: any, b: any) => b[1] - a[1]);

  const scoreBuckets = [
    { label: "90–100", value: summary.score90 },
    { label: "80–89", value: Math.max(0, summary.score80 - summary.score90) },
    { label: "60–79", value: summary.score60to79 },
    { label: "<60", value: summary.below60 },
  ];

  return {
    merchants,
    readiness,
    discoveryMap,
    categories,
    occasions,
    featured,
    topIssues,
    scoreBuckets,
  };
}

export async function getHomepageMerchandisingData() {
  const [featured, categories, occasions] = await Promise.all([
    db.giftCard.findMany({
      where: { featured: true, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
      select: {
        id: true,
        title: true,
        verificationStatus: true,
        merchant: { select: { name: true } },
        _count: { select: { mediaAssets: true, variants: true } },
      },
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { giftCards: true } },
      },
    }),
    db.occasion.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { giftCards: true } },
      },
    }),
  ]);

  return { featured, categories, occasions };
}
