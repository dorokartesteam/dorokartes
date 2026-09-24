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
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: {
          sessions: {
            take: 1,
            orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
            select: { createdAt: true, lastSeenAt: true, expiresAt: true },
          },
        },
      },
      subscription: true,
      premiumPlacements: {
        take: 8,
        orderBy: { createdAt: "desc" },
      },
      merchantLeads: {
        take: 5,
        orderBy: { createdAt: "desc" },
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
