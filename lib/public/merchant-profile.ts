type ProfileCard = {
  id: string;
  title: string;
  officialUrl: string | null;
  verificationStatus: string;
  categories: { category: { name: string; slug: string } }[];
  occasions: { occasion: { name: string; slug: string } }[];
};

export function publicHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function getMerchantProfileDetails(cards: ProfileCard[]) {
  const destinations = new Set<string>();
  const verified = cards.filter(card => card.verificationStatus === "VERIFIED");
  const officialCards = verified.filter(card => {
    const url = publicHttpUrl(card.officialUrl);
    if (!url || destinations.has(url)) return false;
    destinations.add(url);
    return true;
  });
  const categories = [...new Map(cards.flatMap(card => card.categories.map(({ category }) => [category.slug, category] as const))).values()];
  const occasions = [...new Map(cards.flatMap(card => card.occasions.map(({ occasion }) => [occasion.slug, occasion] as const))).values()];
  return { verifiedCount: verified.length, officialCards, categories, occasions };
}
