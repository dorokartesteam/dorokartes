import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isSearchScoreRelevant,
  scoreSearchFields,
} from "@/lib/public/search";

export const dynamic = "force-dynamic";

type GiftCardSuggestion = {
  id: string;
  type: "giftCard";
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

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      ...(category
        ? {
            categories: {
              some: { category: { slug: category, active: true } },
            },
          }
        : {}),
      ...(occasion
        ? {
            occasions: {
              some: { occasion: { slug: occasion, active: true } },
            },
          }
        : {}),
    },
    take: 1200,
    select: {
      id: true,
      title: true,
      slug: true,
      shortDescription: true,
      featured: true,
      verificationStatus: true,
      merchant: {
        select: {
          name: true,
        },
      },
      categories: {
        where: { category: { active: true } },
        select: {
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
      occasions: {
        where: { occasion: { active: true } },
        select: {
          occasion: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  const ranked: GiftCardSuggestion[] = cards
    .map((card) => {
      let score = scoreSearchFields(q, [
        { value: card.merchant.name, weight: 1280 },
        { value: card.title, weight: 1160 },
        ...card.categories.map((item) => ({
          value: `${item.category.name} ${item.category.slug}`,
          weight: 720,
        })),
        ...card.occasions.map((item) => ({
          value: `${item.occasion.name} ${item.occasion.slug}`,
          weight: 740,
        })),
        { value: card.shortDescription, weight: 180 },
      ]);

      if (card.featured) score += 18;
      if (card.verificationStatus === "VERIFIED") score += 12;

      return {
        id: card.id,
        type: "giftCard" as const,
        label: card.title,
        meta: card.merchant.name,
        href: `/gift-cards/${encodeURIComponent(card.slug)}`,
        score,
      };
    })
    .filter((item) => isSearchScoreRelevant(item.score))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.label.localeCompare(b.label, "el"),
    )
    .slice(0, 7);

  return NextResponse.json({
    suggestions: ranked.map(({ score: _score, ...item }) => item),
  });
}
