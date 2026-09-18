import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSearchScoreRelevant, scoreSearchFields } from "@/lib/public/search";

export const dynamic = "force-dynamic";

type RankedSuggestion = {
  id: string;
  type: "merchant" | "giftCard" | "category" | "occasion";
  label: string;
  meta: string;
  href: string;
  score: number;
};

function clean(value: string | null) {
  return value?.trim() || undefined;
}

export async function GET(req: NextRequest) {
  const q = clean(req.nextUrl.searchParams.get("q"));
  const category = clean(req.nextUrl.searchParams.get("category"));
  const occasion = clean(req.nextUrl.searchParams.get("occasion"));

  if (!q) {
    const [categories, occasions, merchants] = await Promise.all([
      prisma.category.findMany({
        where: { active: true, giftCards: { some: { giftCard: { status: "ACTIVE" } } } },
        orderBy: [{ giftCards: { _count: "desc" } }, { sortOrder: "asc" }],
        take: 3,
        select: { id: true, name: true, slug: true, _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } } },
      }),
      prisma.occasion.findMany({
        where: { active: true, giftCards: { some: { giftCard: { status: "ACTIVE" } } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 2,
        select: { id: true, name: true, slug: true, _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } } },
      }),
      prisma.merchant.findMany({
        where: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
        orderBy: [{ featured: "desc" }, { name: "asc" }],
        take: 3,
        select: { id: true, name: true, slug: true, _count: { select: { giftCards: { where: { status: "ACTIVE" } } } } },
      }),
    ]);

    const suggestions: RankedSuggestion[] = [
      ...categories.map((item) => ({ id: item.id, type: "category" as const, label: item.name, meta: `${item._count.giftCards} δωροκάρτες`, href: `/categories/${encodeURIComponent(item.slug)}`, score: 100 })),
      ...occasions.map((item) => ({ id: item.id, type: "occasion" as const, label: item.name, meta: `${item._count.giftCards} δωροκάρτες`, href: `/occasions/${encodeURIComponent(item.slug)}`, score: 90 })),
      ...merchants.map((item) => ({ id: item.id, type: "merchant" as const, label: item.name, meta: `${item._count.giftCards} δωροκάρτες`, href: `/brands/${encodeURIComponent(item.slug)}`, score: 80 })),
    ];

    return NextResponse.json({ suggestions: suggestions.slice(0, 8).map(({ score: _score, ...item }) => item) });
  }

  const cardWhere = {
    status: "ACTIVE" as const,
    ...(category ? { categories: { some: { category: { slug: category, active: true } } } } : {}),
    ...(occasion ? { occasions: { some: { occasion: { slug: occasion, active: true } } } } : {}),
  };

  const [cards, merchants, categories, occasions] = await Promise.all([
    prisma.giftCard.findMany({
      where: cardWhere,
      take: 1500,
      select: {
        id: true, title: true, slug: true, shortDescription: true, featured: true, verificationStatus: true,
        merchant: { select: { name: true, slug: true, featured: true } },
        categories: { select: { category: { select: { name: true, slug: true } } } },
        occasions: { select: { occasion: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.merchant.findMany({
      where: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
      take: 1500,
      select: { id: true, name: true, slug: true, featured: true, _count: { select: { giftCards: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.category.findMany({
      where: { active: true, giftCards: { some: { giftCard: { status: "ACTIVE" } } } },
      select: { id: true, name: true, slug: true, _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } } },
    }),
    prisma.occasion.findMany({
      where: { active: true, giftCards: { some: { giftCard: { status: "ACTIVE" } } } },
      select: { id: true, name: true, slug: true, _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } } },
    }),
  ]);

  const ranked: RankedSuggestion[] = [];

  for (const merchant of merchants) {
    let score = scoreSearchFields(q, [{ value: merchant.name, weight: 1200 }, { value: merchant.slug, weight: 850 }]);
    if (!isSearchScoreRelevant(score)) continue;
    if (merchant.featured) score += 25;
    ranked.push({ id: merchant.id, type: "merchant", label: merchant.name, meta: `${merchant._count.giftCards} δωροκάρτες`, href: `/brands/${encodeURIComponent(merchant.slug)}`, score });
  }

  for (const card of cards) {
    let score = scoreSearchFields(q, [
      { value: card.merchant.name, weight: 1180 },
      { value: card.title, weight: 1050 },
      ...card.categories.map((item) => ({ value: `${item.category.name} ${item.category.slug}`, weight: 800 })),
      ...card.occasions.map((item) => ({ value: `${item.occasion.name} ${item.occasion.slug}`, weight: 820 })),
      { value: card.shortDescription, weight: 260 },
    ]);
    if (!isSearchScoreRelevant(score)) continue;
    if (card.featured) score += 18;
    if (card.verificationStatus === "VERIFIED") score += 12;
    ranked.push({ id: card.id, type: "giftCard", label: card.title, meta: card.merchant.name, href: `/gift-cards/${encodeURIComponent(card.slug)}`, score });
  }

  for (const categoryItem of categories) {
    const score = scoreSearchFields(q, [{ value: categoryItem.name, weight: 1000 }, { value: categoryItem.slug, weight: 920 }]);
    if (!isSearchScoreRelevant(score)) continue;
    ranked.push({ id: categoryItem.id, type: "category", label: categoryItem.name, meta: `${categoryItem._count.giftCards} δωροκάρτες`, href: `/categories/${encodeURIComponent(categoryItem.slug)}`, score });
  }

  for (const occasionItem of occasions) {
    const score = scoreSearchFields(q, [{ value: occasionItem.name, weight: 1020 }, { value: occasionItem.slug, weight: 940 }]);
    if (!isSearchScoreRelevant(score)) continue;
    ranked.push({ id: occasionItem.id, type: "occasion", label: occasionItem.name, meta: `${occasionItem._count.giftCards} δωροκάρτες`, href: `/occasions/${encodeURIComponent(occasionItem.slug)}`, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "el"));

  const selected: RankedSuggestion[] = [];
  const caps = { merchant: 2, giftCard: 4, category: 2, occasion: 2 };
  const used = { merchant: 0, giftCard: 0, category: 0, occasion: 0 };
  for (const item of ranked) {
    if (selected.length >= 9) break;
    if (used[item.type] >= caps[item.type]) continue;
    selected.push(item);
    used[item.type] += 1;
  }

  return NextResponse.json({ suggestions: selected.map(({ score: _score, ...item }) => item) });
}
