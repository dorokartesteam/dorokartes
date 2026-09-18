import { prisma } from "@/lib/prisma";

type AnyPrisma = Record<string, any>;
const db = prisma as unknown as AnyPrisma;

export async function safeCount(model: string, where?: any) {
  try {
    const delegate = db[model];
    if (!delegate?.count) return 0;
    return await delegate.count(where ? { where } : undefined);
  } catch {
    return 0;
  }
}

export async function safeFindMany(model: string, args: any = {}) {
  try {
    const delegate = db[model];
    if (!delegate?.findMany) return [];
    return await delegate.findMany(args);
  } catch {
    return [];
  }
}

export async function safeGroupBy(model: string, args: any) {
  try {
    const delegate = db[model];
    if (!delegate?.groupBy) return [];
    return await delegate.groupBy(args);
  } catch {
    return [];
  }
}

export function ago(value?: Date | string | null) {
  if (!value) return "—";
  const d = new Date(value);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "τώρα";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}λ`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}ω`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}η`;
  return d.toLocaleDateString("el-GR");
}

export function host(url?: string | null) {
  if (!url) return "—";
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

export async function getDashboardData() {
  const [
    merchants,
    activeMerchants,
    cards,
    activeCards,
    verifiedCards,
    reviewCards,
    discoveries,
    queued,
    discovered,
    verifiedDiscovery,
    categories,
    occasions,
    missingImage,
    missingDescription,
    featured,
    recentMerchants,
    recentCards,
    reviewQueue,
  ] = await Promise.all([
    safeCount("merchant"),
    safeCount("merchant", { status: "ACTIVE" }),
    safeCount("giftCard"),
    safeCount("giftCard", { status: "ACTIVE" }),
    safeCount("giftCard", { verificationStatus: "VERIFIED" }),
    safeCount("giftCard", { verificationStatus: "NEEDS_REVIEW" }),
    safeCount("discoveryItem"),
    safeCount("discoveryItem", { status: "QUEUED" }),
    safeCount("discoveryItem", { status: "DISCOVERED" }),
    safeCount("discoveryItem", { status: "VERIFIED" }),
    safeCount("category"),
    safeCount("occasion"),
    safeCount("giftCard", { mediaAssets: { none: {} } }),
    safeCount("giftCard", { OR: [{ description: null }, { description: "" }] }),
    safeCount("giftCard", { featured: true }),
    safeFindMany("merchant", { take: 8, orderBy: { createdAt: "desc" }, select: { id: true, name: true, websiteUrl: true, status: true, createdAt: true } }),
    safeFindMany("giftCard", { take: 8, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, verificationStatus: true, officialUrl: true, createdAt: true, merchant: { select: { name: true } } } }),
    safeFindMany("discoveryItem", { take: 8, where: { status: { in: ["DISCOVERED", "QUEUED"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, merchantName: true, title: true, possibleOfficialUrl: true, status: true, updatedAt: true } }),
  ]);

  return {
    merchants, activeMerchants, cards, activeCards, verifiedCards, reviewCards,
    discoveries, queued, discovered, verifiedDiscovery, categories, occasions,
    missingImage, missingDescription, featured, recentMerchants, recentCards, reviewQueue,
  };
}

export async function getMerchants(search = "", status = "") {
  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { websiteUrl: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;

  return safeFindMany("merchant", {
    take: 150,
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, slug: true, websiteUrl: true, logoUrl: true,
      status: true, country: true, description: true, createdAt: true, updatedAt: true,
      _count: { select: { giftCards: true } },
    },
  });
}

export async function getGiftCards(search = "", status = "", verification = "") {
  const where: any = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { officialUrl: { contains: search, mode: "insensitive" } },
      { merchant: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (status) where.status = status;
  if (verification) where.verificationStatus = verification;

  return safeFindMany("giftCard", {
    take: 150,
    where,
    orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true, title: true, slug: true, officialUrl: true, status: true,
      verificationStatus: true, featured: true, lastVerifiedAt: true, nextReviewAt: true,
      shortDescription: true, validityText: true, corporateAvailable: true,
      personalizationAvailable: true, createdAt: true, updatedAt: true,
      merchant: { select: { id: true, name: true, logoUrl: true } },
      _count: { select: { variants: true, categories: true, occasions: true, mediaAssets: true } },
    },
  });
}

export async function getDiscovery(search = "", status = "") {
  const where: any = {};
  if (search) {
    where.OR = [
      { merchantName: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { possibleOfficialUrl: { contains: search, mode: "insensitive" } },
      { sourceName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;

  return safeFindMany("discoveryItem", {
    take: 200,
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, merchantName: true, title: true, sourceName: true, sourceUrl: true,
      possibleOfficialUrl: true, status: true, notes: true, createdAt: true, updatedAt: true,
    },
  });
}

export async function getVerificationData() {
  const now = new Date();

  const [review, stale, brokenFlags, events] = await Promise.all([
    prisma.giftCard.findMany({
      where: { verificationStatus: "NEEDS_REVIEW" },
      take: 200,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        officialUrl: true,
        verificationStatus: true,
        lastVerifiedAt: true,
        nextReviewAt: true,
        merchant: { select: { name: true } },
      },
    }),

    prisma.giftCard.findMany({
      where: {
        verificationStatus: "VERIFIED",
        nextReviewAt: { lte: now },
      },
      take: 200,
      orderBy: { nextReviewAt: "asc" },
      select: {
        id: true,
        title: true,
        officialUrl: true,
        verificationStatus: true,
        lastVerifiedAt: true,
        nextReviewAt: true,
        merchant: { select: { name: true } },
      },
    }),

    prisma.productionReviewFlag.findMany({
      where: { status: "OPEN" },
      take: 200,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        giftCardId: true,
        type: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    }),

    prisma.verificationEvent.findMany({
      take: 50,
      orderBy: { checkedAt: "desc" },
      select: {
        id: true,
        giftCardId: true,
        result: true,
        notes: true,
        checkedAt: true,
      },
    }),
  ]);

  return { review, stale, brokenFlags, events };
}

export async function getTaxonomyData() {
  const [categories, occasions] = await Promise.all([
    safeFindMany("category", { take: 200, orderBy: { sortOrder: "asc" } }),
    safeFindMany("occasion", { take: 200, orderBy: { sortOrder: "asc" } }),
  ]);
  return { categories, occasions };
}

export async function getQualityData() {
  const [missingDescriptions, missingMedia, missingVariants, noCategory, noOccasion, reviewFlags] = await Promise.all([
    safeFindMany("giftCard", { take: 100, where: { OR: [{ description: null }, { description: "" }] }, select: { id: true, title: true, officialUrl: true, merchant: { select: { name: true } } } }),
    safeFindMany("giftCard", { take: 100, where: { mediaAssets: { none: {} } }, select: { id: true, title: true, merchant: { select: { name: true } } } }),
    safeFindMany("giftCard", { take: 100, where: { variants: { none: {} } }, select: { id: true, title: true, merchant: { select: { name: true } } } }),
    safeFindMany("giftCard", { take: 100, where: { categories: { none: {} } }, select: { id: true, title: true, merchant: { select: { name: true } } } }),
    safeFindMany("giftCard", { take: 100, where: { occasions: { none: {} } }, select: { id: true, title: true, merchant: { select: { name: true } } } }),
    safeFindMany("productionReviewFlag", { take: 100, orderBy: { createdAt: "desc" } }),
  ]);
  return { missingDescriptions, missingMedia, missingVariants, noCategory, noOccasion, reviewFlags };
}

export async function getAnalyticsData() {
  const [clicks, recentClicks, searchEvents] = await Promise.all([
    safeCount("outboundClick"),
    safeFindMany("outboundClick", { take: 100, orderBy: { createdAt: "desc" } }),
    safeFindMany("searchEvent", { take: 100, orderBy: { createdAt: "desc" } }),
  ]);
  return { clicks, recentClicks, searchEvents };
}
