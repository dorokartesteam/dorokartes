import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { greekToLatin, normalizeSearchText } from "@/lib/public/search";

export const revalidate = 300;

function compactSearchText(parts: Array<string | null | undefined>) {
  const raw = parts.filter(Boolean).join(" ");
  const normalized = normalizeSearchText(raw);
  const latin = greekToLatin(raw);

  return normalized === latin
    ? normalized
    : `${normalized} ${latin}`.trim();
}

export async function GET() {
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE" },
    orderBy: [
      { featured: "desc" },
      { merchant: { name: "asc" } },
      { title: "asc" },
    ],
    select: {
      id: true,
      title: true,
      slug: true,
      featured: true,
      verificationStatus: true,
      merchant: {
        select: {
          name: true,
          logoUrl: true,
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

  const index = cards.map((card) => ({
    id: card.id,
    title: card.title,
    slug: card.slug,
    merchantName: card.merchant.name,
    merchantLogoUrl: card.merchant.logoUrl,
    titleSearch: compactSearchText([card.title]),
    merchantSearch: compactSearchText([card.merchant.name]),
    contextSearch: compactSearchText([
      ...card.categories.flatMap((item) => [
        item.category.name,
        item.category.slug,
      ]),
      ...card.occasions.flatMap((item) => [
        item.occasion.name,
        item.occasion.slug,
      ]),
    ]),
    featured: card.featured,
    verified: card.verificationStatus === "VERIFIED",
  }));

  return NextResponse.json(
    { index },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
