import type { Metadata } from "next";
import PublicHeader from "@/components/public/PublicHeader";
import PublicHero from "@/components/public/PublicHero";
import WhyDorokartes from "@/components/public/WhyDorokartes";
import CategoriesSection from "@/components/public/CategoriesSection";
import FeaturedCardsSection from "@/components/public/FeaturedCardsSection";
import OccasionsSection from "@/components/public/OccasionsSection";
import BrandsSection from "@/components/public/BrandsSection";
import GrowthSection from "@/components/public/GrowthSection";
import PublicFooter from "@/components/public/PublicFooter";
import PremiumMerchantBanner, { type PremiumMerchantSlide } from "@/components/public/PremiumMerchantBanner";
import { getHomeData, publicCardSelect, type PublicCard } from "@/lib/public/data";
import { prisma } from "@/lib/prisma";
import { merchantPublicTier } from "@/lib/public/merchant-entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dorokartes.gr | Όλες οι δωροκάρτες σε ένα μέρος",
    description:
      "Ανακάλυψε δωροκάρτες από καταστήματα και υπηρεσίες στην Ελλάδα και συνέχισε στον επίσημο ιστότοπο του εμπόρου.",
    url: "/",
  },
};

const HOMEPAGE_BRAND_PRIORITY = [
  "nike",
  "zara",
  "h-m",
  "adidas",
  "ikea",
  "bershka",
  "pull-and-bear",
  "stradivarius",
  "oysho",
  "massimo-dutti",
  "zara-home",
  "playstation",
  "steam",
  "netflix",
] as const;

const priorityBySlug = new Map(
  HOMEPAGE_BRAND_PRIORITY.map((slug, index) => [slug, index]),
);

function priorityForSlug(slug: string | null | undefined) {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  return priorityBySlug.get(slug as (typeof HOMEPAGE_BRAND_PRIORITY)[number]) ??
    Number.MAX_SAFE_INTEGER;
}

function mergeCards(
  preferred: PublicCard[],
  fallback: PublicCard[],
  limit = 9,
) {
  const merged: PublicCard[] = [];
  const seenCards = new Set<string>();
  const seenMerchants = new Set<string>();

  for (const card of [...preferred, ...fallback]) {
    if (seenCards.has(card.id)) continue;

    // Prefer visual variety on the homepage: one card per merchant first.
    const merchantKey = card.merchant?.slug || card.merchant?.id || "";
    if (merchantKey && seenMerchants.has(merchantKey) && merged.length < limit) {
      continue;
    }

    seenCards.add(card.id);
    if (merchantKey) seenMerchants.add(merchantKey);
    merged.push(card);

    if (merged.length >= limit) return merged;
  }

  // If there were not enough unique merchants, fill remaining slots normally.
  for (const card of [...preferred, ...fallback]) {
    if (seenCards.has(card.id)) continue;

    seenCards.add(card.id);
    merged.push(card);

    if (merged.length >= limit) break;
  }

  return merged;
}

export default async function HomePage() {
  const now = new Date();
  const [data, preferredMerchants, preferredCardsRaw, premiumPlacements] = await Promise.all([
    getHomeData(),

    prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        slug: { in: [...HOMEPAGE_BRAND_PRIORITY] },
        giftCards: {
          some: {
            status: "ACTIVE",
            verificationStatus: "VERIFIED",
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: {
          select: {
            giftCards: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    }),

    prisma.giftCard.findMany({
      where: {
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        merchant: {
          status: "ACTIVE",
          slug: { in: [...HOMEPAGE_BRAND_PRIORITY] },
        },
      },
      select: publicCardSelect,
    }),

    prisma.premiumPlacement.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gt: now },
        merchant: {
          status: "ACTIVE",
          giftCards: { some: { status: "ACTIVE" } },
        },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 8,
      select: {
        id: true,
        merchant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            description: true,
            subscription: {
              select: { plan: true, status: true, endsAt: true },
            },
            giftCards: {
              where: { status: "ACTIVE" },
              orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
              take: 4,
              select: {
                title: true,
                slug: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const curatedMerchants = preferredMerchants
    .sort((a, b) => priorityForSlug(a.slug) - priorityForSlug(b.slug))
    .slice(0, 14);

  const preferredCards = preferredCardsRaw.sort((a, b) => {
    const brandPriority =
      priorityForSlug(a.merchant?.slug) - priorityForSlug(b.merchant?.slug);

    if (brandPriority !== 0) return brandPriority;

    return a.title.localeCompare(b.title, "el");
  });

  const homepageCards = mergeCards(preferredCards, data.cards, 9);
  const premiumSlides: PremiumMerchantSlide[] = premiumPlacements
    .flatMap((placement) => {
      if (merchantPublicTier(placement.merchant.subscription, now) !== "PREMIUM_BANNER") {
        return [];
      }

      const card =
        placement.merchant.giftCards.find((item) => item.verificationStatus === "VERIFIED") ||
        placement.merchant.giftCards[0] ||
        null;

      return [{
        placementId: placement.id,
        merchantId: placement.merchant.id,
        name: placement.merchant.name,
        slug: placement.merchant.slug,
        logoUrl: placement.merchant.logoUrl,
        description: placement.merchant.description,
        cardTitle: card?.title || null,
        cardSlug: card?.slug || null,
      }];
    })
    .slice(0, 4);

  return (
    <div className="dk14-site">
      <PublicHeader />

      <main>
        <PublicHero totalCards={data.totalCards} />
        {premiumSlides.length > 0 ? <PremiumMerchantBanner slides={premiumSlides} /> : null}
        <WhyDorokartes />

        {data.categories.length > 0 && (
          <CategoriesSection categories={data.categories} />
        )}

        {homepageCards.length > 0 && (
          <FeaturedCardsSection cards={homepageCards} />
        )}

        {data.occasions.length > 0 && (
          <OccasionsSection occasions={data.occasions} />
        )}

        {(curatedMerchants.length > 0 || data.merchants.length > 0) && (
          <BrandsSection
            merchants={
              curatedMerchants.length > 0 ? curatedMerchants : data.merchants
            }
          />
        )}

        <GrowthSection />
      </main>

      <PublicFooter />
    </div>
  );
}
