import { prisma } from "@/lib/prisma";

const db = prisma as any;

export async function getMerchantCms(id: string) {
  return db.merchant.findUnique({
    where: { id },
    include: {
      giftCards: {
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { variants: true, categories: true, occasions: true, mediaAssets: true } },
        },
      },
    },
  });
}

export async function getGiftCardCms(id: string) {
  return db.giftCard.findUnique({
    where: { id },
    include: {
      merchant: true,
      variants: true,
      categories: { include: { category: true } },
      occasions: { include: { occasion: true } },
      mediaAssets: true,
      sources: true,
      verificationEvents: {
        take: 20,
        orderBy: { checkedAt: "desc" } },
      reviewFlags: { take: 20, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getTaxonomyOptions() {
  const [categories, occasions] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.occasion.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return { categories, occasions };
}
