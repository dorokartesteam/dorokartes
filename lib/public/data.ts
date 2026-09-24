import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import { isSearchScoreRelevant, scoreSearchFields } from "@/lib/public/search";
import { rankRelatedCards, type RelatedCard } from "./catalog-search";
import { getPromotedMerchantBuckets, merchantPromotionRank } from "./merchant-entitlements";

export const publicCardSelect = {
  id:true,title:true,slug:true,shortDescription:true,officialUrl:true,featured:true,verificationStatus:true,validityText:true,validityMonths:true,
  merchant:{select:{id:true,name:true,
      logoUrl: true,slug:true,websiteUrl:true,featured:true,subscription:{select:{plan:true,status:true,endsAt:true}}}},
  categories:{where:{category:{active:true}},take:3,orderBy:{primary:"desc" as const},select:{primary:true,category:{select:{id:true,name:true,slug:true,icon:true}}}},
  occasions:{where:{occasion:{active:true}},take:3,orderBy:{relevance:"desc" as const},select:{relevance:true,occasion:{select:{id:true,name:true,slug:true,icon:true}}}},
  variants:{where:{active:true},take:6,select:{id:true,type:true,minValue:true,maxValue:true,customValueAllowed:true,purchaseUrl:true,values:{take:8,orderBy:{value:"asc" as const},select:{value:true}},redemptions:{select:{channel:true}},deliveries:{select:{method:true}}}},
} as const;

export type PublicCard = Prisma.GiftCardGetPayload<{ select: typeof publicCardSelect }>;

export const PUBLIC_CATALOG_PAGE_SIZE = 24;

export type PublicCatalogFilters = {
  q?: string;
  category?: string;
  occasion?: string;
};

export type PublicCardPage = {
  cards: PublicCard[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  approximate?: boolean;
};

export function readPublicSearchParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export function parsePublicPage(value: string | string[] | undefined) {
  const raw = readPublicSearchParam(value);
  if (!raw || !/^\d+$/.test(raw)) return 1;

  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export async function getPublicCardPage(
  where: Prisma.GiftCardWhereInput,
  requestedPage: number,
  pageSize = PUBLIC_CATALOG_PAGE_SIZE,
): Promise<PublicCardPage> {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0
    ? pageSize
    : PUBLIC_CATALOG_PAGE_SIZE;
  const { premiumMerchantIds, featuredMerchantIds, promotedMerchantIds } =
    await getPromotedMerchantBuckets();

  const premiumWhere: Prisma.GiftCardWhereInput = premiumMerchantIds.length
    ? { AND: [where, { merchantId: { in: premiumMerchantIds } }] }
    : { id: { in: [] } };
  const featuredWhere: Prisma.GiftCardWhereInput = featuredMerchantIds.length
    ? { AND: [where, { merchantId: { in: featuredMerchantIds } }] }
    : { id: { in: [] } };
  const standardWhere: Prisma.GiftCardWhereInput = promotedMerchantIds.length
    ? { AND: [where, { merchantId: { notIn: promotedMerchantIds } }] }
    : where;

  const [totalCount, premiumCount, featuredCount] = await Promise.all([
    prisma.giftCard.count({ where }),
    premiumMerchantIds.length ? prisma.giftCard.count({ where: premiumWhere }) : 0,
    featuredMerchantIds.length ? prisma.giftCard.count({ where: featuredWhere }) : 0,
  ]);

  const standardCount = Math.max(0, totalCount - premiumCount - featuredCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );

  const orderBy: Prisma.GiftCardOrderByWithRelationInput[] = [
    { featured: "desc" },
    { merchant: { name: "asc" } },
    { title: "asc" },
    { id: "asc" },
  ];
  const cards: PublicCard[] = [];
  let remainingSkip = (currentPage - 1) * safePageSize;
  let remainingTake = safePageSize;

  const appendBucket = async (
    bucketWhere: Prisma.GiftCardWhereInput,
    bucketCount: number,
  ) => {
    if (remainingTake <= 0 || bucketCount <= 0) return;
    if (remainingSkip >= bucketCount) {
      remainingSkip -= bucketCount;
      return;
    }

    const take = Math.min(remainingTake, bucketCount - remainingSkip);
    const rows = await prisma.giftCard.findMany({
      where: bucketWhere,
      orderBy,
      skip: remainingSkip,
      take,
      select: publicCardSelect,
    });

    cards.push(...rows);
    remainingTake -= rows.length;
    remainingSkip = 0;
  };

  if (totalCount > 0) {
    await appendBucket(premiumWhere, premiumCount);
    await appendBucket(featuredWhere, featuredCount);
    await appendBucket(standardWhere, standardCount);
  }

  return { cards, totalCount, currentPage, totalPages, pageSize: safePageSize };
}

export function buildPublicCatalogWhere({
  q,
  category,
  occasion,
}: PublicCatalogFilters): Prisma.GiftCardWhereInput {
  const where: Prisma.GiftCardWhereInput = {
    status: "ACTIVE",
    merchant: { status: "ACTIVE" },
  };
  const term = q?.trim();
  const categorySlug = category?.trim();
  const occasionSlug = occasion?.trim();

  if (term) {
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { merchant: { name: { contains: term, mode: "insensitive" } } },
      { shortDescription: { contains: term, mode: "insensitive" } },
    ];
  }

  if (categorySlug) {
    where.categories = {
      some: { category: { slug: categorySlug, active: true } },
    };
  }

  if (occasionSlug) {
    where.occasions = {
      some: { occasion: { slug: occasionSlug, active: true } },
    };
  }

  return where;
}

export async function getHomeData(){
  const [cards,categories,occasions,merchants,totalCards]=await Promise.all([
    getHomeCards(),
    prisma.category.findMany({where:{active:true},orderBy:[{sortOrder:"asc"},{name:"asc"}],select:{id:true,name:true,slug:true,icon:true,_count:{select:{giftCards:{where:{giftCard:{status:"ACTIVE"}}}}}}}),
    prisma.occasion.findMany({where:{active:true,giftCards:{some:{giftCard:{status:"ACTIVE"}}}},orderBy:[{sortOrder:"asc"},{name:"asc"}],select:{id:true,name:true,slug:true,icon:true,_count:{select:{giftCards:{where:{giftCard:{status:"ACTIVE"}}}}}}}),
    prisma.merchant.findMany({where:{status:"ACTIVE",giftCards:{some:{status:"ACTIVE"}}},orderBy:[{featured:"desc"},{name:"asc"}],take:14,select:{id:true,name:true,slug:true,logoUrl:true,_count:{select:{giftCards:{where:{status:"ACTIVE"}}}}}}),
    prisma.giftCard.count({where:{status:"ACTIVE"}}),
  ]);
  return {cards,categories,occasions,merchants,totalCards};
}

async function getHomeCards() {
  const orderBy: Prisma.GiftCardOrderByWithRelationInput[] = [{ featured: "desc" }, { updatedAt: "desc" }, { id: "asc" }];
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", verificationStatus: "VERIFIED" },
    orderBy, take: 18, select: publicCardSelect,
  });
  if (cards.length === 18) return cards;
  const rest = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", verificationStatus: { not: "VERIFIED" } },
    orderBy, take: 18 - cards.length, select: publicCardSelect,
  });
  return [...cards, ...rest];
}

export async function browseCards(
  filters: PublicCatalogFilters = {},
  requestedPage = 1,
){
  const term = filters.q?.trim();
  if (!term) return getPublicCardPage(buildPublicCatalogWhere(filters), requestedPage);

  const baseWhere = buildPublicCatalogWhere({
    category: filters.category,
    occasion: filters.occasion,
  });

  // Keep the predictive Smart Search ranking as the single browse ranking path.
  // Fetch only compact searchable fields for the candidate set.
  const candidates = await prisma.giftCard.findMany({
    where: baseWhere,
    take: 2000,
    select: {
      id: true,
      title: true,
      shortDescription: true,
      featured: true,
      verificationStatus: true,
      merchant: { select: { name: true, subscription: { select: { plan: true, status: true, endsAt: true } } } },
      categories: {
        where: { category: { active: true } },
        select: { category: { select: { name: true, slug: true } } },
      },
      occasions: {
        where: { occasion: { active: true } },
        select: { occasion: { select: { name: true, slug: true } } },
      },
    },
  });

  const ranked = candidates
    .map((card) => {
      const relevanceScore = scoreSearchFields(term, [
        { value: card.merchant.name, weight: 1200 },
        { value: card.title, weight: 1060 },
        ...card.categories.map((item) => ({
          value: `${item.category.name} ${item.category.slug}`,
          weight: 820,
        })),
        ...card.occasions.map((item) => ({
          value: `${item.occasion.name} ${item.occasion.slug}`,
          weight: 840,
        })),
        { value: card.shortDescription, weight: 260 },
      ]);

      if (!isSearchScoreRelevant(relevanceScore)) return null;

      let score = relevanceScore;
      const promotionRank = merchantPromotionRank(card.merchant.subscription);
      if (promotionRank === 2) score += 90;
      if (promotionRank === 1) score += 55;
      if (card.featured) score += 18;
      if (card.verificationStatus === "VERIFIED") score += 12;

      return { id: card.id, score };
    })
    .filter((item): item is { id: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const totalCount = ranked.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const start = (currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE;
  const pageIds = ranked
    .slice(start, start + PUBLIC_CATALOG_PAGE_SIZE)
    .map((item) => item.id);

  const cards = await getCardsInOrder(pageIds, baseWhere);

  return {
    cards,
    totalCount,
    currentPage,
    totalPages,
    pageSize: PUBLIC_CATALOG_PAGE_SIZE,
    approximate: false,
  };
}

async function getCardsInOrder(
  ids: string[],
  where: Prisma.GiftCardWhereInput,
) {
  if (!ids.length) return [];

  const cards = await prisma.giftCard.findMany({
    where: {
      AND: [
        where,
        { id: { in: ids } },
      ],
    },
    select: publicCardSelect,
  });

  const byId = new Map(cards.map((card) => [card.id, card]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

export async function getRelatedCards(card: RelatedCard) {
  const where: Prisma.GiftCardWhereInput = {
    status: "ACTIVE",
    merchant: { status: "ACTIVE" },
    id: { not: card.id },
    OR: [
      { merchantId: card.merchantId },
      {
        categories: {
          some: {
            category: {
              active: true,
              slug: { in: card.categories.map((item) => item.category.slug) },
            },
          },
        },
      },
      {
        occasions: {
          some: {
            occasion: {
              active: true,
              slug: { in: card.occasions.map((item) => item.occasion.slug) },
            },
          },
        },
      },
    ],
  };

  const candidates = await prisma.giftCard.findMany({
    where,
    select: {
      id: true,
      merchantId: true,
      verificationStatus: true,
      categories: {
        where: { category: { active: true } },
        select: {
          primary: true,
          category: { select: { slug: true } },
        },
      },
      occasions: {
        where: { occasion: { active: true } },
        select: {
          occasion: { select: { slug: true } },
        },
      },
    },
  });

  return getCardsInOrder(rankRelatedCards(card, candidates), where);
}
