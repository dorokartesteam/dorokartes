import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/src/generated/prisma/client";

export const publicCardSelect = {
  id:true,title:true,slug:true,shortDescription:true,officialUrl:true,featured:true,verificationStatus:true,validityText:true,validityMonths:true,
  merchant:{select:{id:true,name:true,
      logoUrl: true,slug:true,websiteUrl:true,featured:true}},
  categories:{take:3,orderBy:{primary:"desc" as const},select:{primary:true,category:{select:{id:true,name:true,slug:true,icon:true}}}},
  occasions:{take:3,orderBy:{relevance:"desc" as const},select:{relevance:true,occasion:{select:{id:true,name:true,slug:true,icon:true}}}},
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
  const totalCount = await prisma.giftCard.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const cards = totalCount > 0
    ? await prisma.giftCard.findMany({
        where,
        orderBy: [
          { featured: "desc" },
          { merchant: { name: "asc" } },
          { title: "asc" },
          { id: "asc" },
        ],
        skip: (currentPage - 1) * safePageSize,
        take: safePageSize,
        select: publicCardSelect,
      })
    : [];

  return { cards, totalCount, currentPage, totalPages, pageSize: safePageSize };
}

export function buildPublicCatalogWhere({
  q,
  category,
  occasion,
}: PublicCatalogFilters): Prisma.GiftCardWhereInput {
  const where: Prisma.GiftCardWhereInput = { status: "ACTIVE" };
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
    prisma.giftCard.findMany({where:{status:"ACTIVE"},orderBy:[{featured:"desc"},{updatedAt:"desc"}],take:18,select:publicCardSelect}),
    prisma.category.findMany({where:{active:true},orderBy:[{sortOrder:"asc"},{name:"asc"}],select:{id:true,name:true,slug:true,icon:true,_count:{select:{giftCards:{where:{giftCard:{status:"ACTIVE"}}}}}}}),
    prisma.occasion.findMany({where:{active:true,giftCards:{some:{giftCard:{status:"ACTIVE"}}}},orderBy:[{sortOrder:"asc"},{name:"asc"}],take:12,select:{id:true,name:true,slug:true,icon:true,_count:{select:{giftCards:{where:{giftCard:{status:"ACTIVE"}}}}}}}),
    prisma.merchant.findMany({where:{status:"ACTIVE",giftCards:{some:{status:"ACTIVE"}}},orderBy:[{featured:"desc"},{name:"asc"}],take:14,select:{id:true,name:true,slug:true,logoUrl:true,_count:{select:{giftCards:{where:{status:"ACTIVE"}}}}}}),
    prisma.giftCard.count({where:{status:"ACTIVE"}}),
  ]);
  return {cards,categories,occasions,merchants,totalCards};
}

export async function browseCards(
  filters: PublicCatalogFilters = {},
  requestedPage = 1,
){
  return getPublicCardPage(buildPublicCatalogWhere(filters), requestedPage);
}
