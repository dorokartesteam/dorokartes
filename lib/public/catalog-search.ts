export type CatalogSearchCard = {
  id: string;
  title: string;
  shortDescription: string | null;
  verificationStatus: string;
  featured: boolean;
  merchant: { name: string };
  categories: { category: { name: string; slug: string } }[];
  occasions: { occasion: { name: string; slug: string } }[];
};

export function normalizeCatalogText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Restricted Damerau distance: adjacent transpositions count as one typo.
function typoDistance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let older: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], older[j - 2] + 1);
      }
    }
    older = previous;
    previous = current;
  }
  return previous[b.length];
}

function fieldScore(term: string, text: string, weight: number, fuzzy: boolean) {
  const words = text.split(" ");
  if (words.includes(term)) return weight;
  if (term.length >= 3 && words.some(word => word.startsWith(term))) return weight * 0.6;
  if (!fuzzy || term.length < 4) return 0;
  const limit = term.length >= 8 ? 2 : 1;
  return words.some(word => word.length >= 4 && typoDistance(term, word, limit) <= limit)
    ? weight * 0.35 : 0;
}

export function rankCatalogSearch(cards: CatalogSearchCard[], query: string) {
  const normalized = normalizeCatalogText(query);
  const terms = [...new Set(normalized.split(" ").filter(Boolean))];
  if (!terms.length || normalized.length > 160 || terms.length > 12) {
    return { ids: [] as string[], approximate: false };
  }
  const documents = cards.map(card => ({
    card,
    merchant: normalizeCatalogText(card.merchant.name),
    title: normalizeCatalogText(card.title),
    taxonomy: normalizeCatalogText([
      ...card.categories.flatMap(x => [x.category.name, x.category.slug]),
      ...card.occasions.flatMap(x => [x.occasion.name, x.occasion.slug]),
    ].join(" ")),
    description: normalizeCatalogText(card.shortDescription || ""),
  }));
  function rank(fuzzy: boolean) {
    return documents.flatMap(doc => {
      const exactMerchant = doc.merchant.replaceAll(" ", "") === normalized.replaceAll(" ", "");
      const scores = terms.map(term => Math.max(
        fieldScore(term, doc.merchant, 120, fuzzy),
        fieldScore(term, doc.title, 95, fuzzy),
        fieldScore(term, doc.taxonomy, 90, fuzzy),
        // Description-only matches are weak and never expanded by typo tolerance.
        fieldScore(term, doc.description, 8, false),
      ));
      if (!exactMerchant && scores.some(score => score === 0)) return [];
      const score = (exactMerchant ? 1000 : 0)
        + (doc.title === normalized ? 400 : 0)
        + scores.reduce((sum, n) => sum + n, 0)
        // Imported archive headings should not beat real brands for generic terms.
        - (!exactMerchant && /^(?:archives|αρχεία)\s*[-–|:]/iu.test(doc.card.merchant.name) ? 50 : 0);
      return [{ ...doc, score }];
    }).sort((a, b) => b.score - a.score
      || Number(b.card.verificationStatus === "VERIFIED") - Number(a.card.verificationStatus === "VERIFIED")
      || Number(b.card.featured) - Number(a.card.featured)
      || a.merchant.localeCompare(b.merchant, "el")
      || a.card.id.localeCompare(b.card.id)).map(doc => doc.card.id);
  }
  const exact = rank(false);
  if (exact.length) return { ids: exact, approximate: false };
  const approximate = rank(true);
  return { ids: approximate, approximate: approximate.length > 0 };
}

export type RelatedCard = {
  id: string;
  merchantId: string;
  verificationStatus: string;
  categories: { primary: boolean; category: { slug: string } }[];
  occasions: { occasion: { slug: string } }[];
};

export function rankRelatedCards(current: RelatedCard, candidates: RelatedCard[], limit = 6) {
  const categories = new Set(current.categories.map(x => x.category.slug));
  const primary = new Set(current.categories.filter(x => x.primary).map(x => x.category.slug));
  const occasions = new Set(current.occasions.map(x => x.occasion.slug));
  const ranked = candidates.filter(c => c.id !== current.id).map(card => ({
    card,
    score: (card.merchantId === current.merchantId ? 12 : 0)
      + card.categories.reduce((n, x) => n + (primary.has(x.category.slug) ? 8 : categories.has(x.category.slug) ? 4 : 0), 0)
      + card.occasions.reduce((n, x) => n + (occasions.has(x.occasion.slug) ? 1 : 0), 0),
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score
    || Number(b.card.verificationStatus === "VERIFIED") - Number(a.card.verificationStatus === "VERIFIED")
    || a.card.id.localeCompare(b.card.id));
  const merchants = new Set<string>();
  return ranked.filter(({ card }) => {
    if (merchants.has(card.merchantId)) return false;
    merchants.add(card.merchantId);
    return true;
  }).slice(0, limit).map(x => x.card.id);
}
