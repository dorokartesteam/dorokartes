import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LANDING_SLUGS } from "@/lib/public/category-landing-content";
import {
  OCCASION_LANDING_SLUGS,
  isOccasionLandingReadyForIndexing,
} from "@/lib/public/occasion-landing-content";

export const dynamic = "force-dynamic";

const fallbackBaseUrl = "https://dorokartes.gr";

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackBaseUrl;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  const [cards, merchants, categories, occasions] = await Promise.all([
    prisma.giftCard.findMany({
      where: { status: "ACTIVE", verificationStatus: "VERIFIED" },
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        giftCards: { some: { status: "ACTIVE", verificationStatus: "VERIFIED" } },
      },
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      where: {
        active: true,
        slug: { in: [...CATEGORY_LANDING_SLUGS] },
        giftCards: {
          some: { giftCard: { status: "ACTIVE" } },
        },
      },
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.occasion.findMany({
      where: {
        active: true,
        slug: { in: OCCASION_LANDING_SLUGS.filter(isOccasionLandingReadyForIndexing) },
        giftCards: {
          some: { giftCard: { status: "ACTIVE" } },
        },
      },
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/occasions`, changeFrequency: "weekly", priority: 0.82 },
    { url: `${base}/regions`, changeFrequency: "weekly", priority: 0.8 },
    ...cards.map((card) => ({
      url: `${base}/gift-cards/${encodeURIComponent(card.slug)}`,
      lastModified: card.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...merchants.map((merchant) => ({
      url: `${base}/brands/${encodeURIComponent(merchant.slug)}`,
      lastModified: merchant.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...categories.map((category) => ({
      url: `${base}/categories/${encodeURIComponent(category.slug)}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.72,
    })),
    ...occasions.map((occasion) => ({
      url: `${base}/occasions/${encodeURIComponent(occasion.slug)}`,
      lastModified: occasion.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.68,
    })),
  ];
}
