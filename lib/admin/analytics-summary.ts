export type ClickGroup = { merchantId: string | null; giftCardId: string | null; _count: { _all: number } };
export type AnalyticsCard = {
  id: string; title: string;
  categories: { primary: boolean; category: { id: string; name: string } }[];
};
type RankedCount = { id: string; name: string; count: number };

export function summarizeOutboundClicks(groups: ClickGroup[], cards: AnalyticsCard[], merchants: { id: string; name: string }[]) {
  const cardById = new Map(cards.map(card => [card.id, card]));
  const merchantById = new Map(merchants.map(merchant => [merchant.id, merchant]));
  const cardTotals = new Map<string, RankedCount>();
  const merchantTotals = new Map<string, RankedCount>();
  const categoryTotals = new Map<string, RankedCount>();
  function add(target: Map<string, RankedCount>, id: string | null, name: string, count: number) {
    const key = id || "unknown";
    target.set(key, { id: key, name, count: (target.get(key)?.count || 0) + count });
  }
  for (const group of groups) {
    const count = group._count._all;
    const card = cardById.get(group.giftCardId || "");
    const merchant = merchantById.get(group.merchantId || "");
    add(cardTotals, group.giftCardId, card?.title || "Unavailable gift card", count);
    add(merchantTotals, group.merchantId, merchant?.name || "Unavailable merchant", count);
    // One category per click; multi-category cards must not inflate totals.
    const category = card?.categories.filter(item => item.primary).sort((a, b) => a.category.id.localeCompare(b.category.id))[0]?.category;
    add(categoryTotals, category?.id || null, category?.name || "No primary category", count);
  }
  const ranked = (values: Map<string, RankedCount>) => [...values.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    clicks: groups.reduce((sum, group) => sum + group._count._all, 0),
    merchants: ranked(merchantTotals), cards: ranked(cardTotals), categories: ranked(categoryTotals),
  };
}
