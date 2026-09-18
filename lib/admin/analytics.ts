import { prisma } from "@/lib/prisma";
import { summarizeOutboundClicks } from "./analytics-summary";

async function getOutboundData(since: Date) {
  const [groups, recentClicks] = await Promise.all([
    prisma.outboundClick.groupBy({
      by: ["merchantId", "giftCardId"], where: { clickedAt: { gte: since } }, _count: { _all: true },
    }),
    prisma.outboundClick.findMany({
      where: { clickedAt: { gte: since } }, take: 100, orderBy: [{ clickedAt: "desc" }, { id: "desc" }],
      select: { id: true, clickedAt: true, destinationUrl: true, source: true,
        merchant: { select: { name: true } }, giftCard: { select: { title: true } } },
    }),
  ]);
  const cardIds = [...new Set(groups.flatMap(group => group.giftCardId ? [group.giftCardId] : []))];
  const merchantIds = [...new Set(groups.flatMap(group => group.merchantId ? [group.merchantId] : []))];
  const [cards, merchants] = await Promise.all([
    prisma.giftCard.findMany({ where: { id: { in: cardIds } }, select: {
      id: true, title: true, categories: { where: { primary: true }, select: { primary: true, category: { select: { id: true, name: true } } } },
    } }),
    prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, name: true } }),
  ]);
  return { ...summarizeOutboundClicks(groups, cards, merchants), recentClicks };
}

export async function getAnalyticsData(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [outbound, search] = await Promise.allSettled([
    getOutboundData(since),
    Promise.all([
      prisma.searchEvent.count({ where: { searchedAt: { gte: since } } }),
      prisma.searchEvent.findMany({ where: { searchedAt: { gte: since } }, take: 100, orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
        select: { id: true, query: true, resultsCount: true, searchedAt: true } }),
    ]),
  ]);
  return {
    since,
    outbound: outbound.status === "fulfilled" ? outbound.value : null,
    search: search.status === "fulfilled" ? { count: search.value[0], events: search.value[1] } : null,
  };
}
