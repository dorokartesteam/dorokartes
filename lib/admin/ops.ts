import { prisma } from "@/lib/prisma";
const db = prisma as any;

export async function getCreateData() {
  const merchants = await db.merchant.findMany({
    take: 2000,
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  return { merchants };
}

export async function getBulkData() {
  const [cards, categories, occasions] = await Promise.all([
    db.giftCard.findMany({
      take: 300,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, status: true, verificationStatus: true, featured: true,
        merchant: { select: { name: true } },
      },
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.occasion.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return { cards, categories, occasions };
}

export async function getMergeData() {
  return db.merchant.findMany({
    take: 2000,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, websiteUrl: true, status: true,
      _count: { select: { giftCards: true } },
    },
  });
}
