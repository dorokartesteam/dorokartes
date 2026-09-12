import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import TaxonomyLanding from "@/components/public/TaxonomyLanding";
import { prisma } from "@/lib/prisma";
import { PUBLIC_CATALOG_PAGE_SIZE, getPublicCardPage, parsePublicPage } from "@/lib/public/data";
import { getOccasionLandingContent } from "@/lib/public/occasion-landing-content";

export const dynamic = "force-dynamic";

const getOccasionPage = cache(async (slug: string) => {
  const occasion = await prisma.occasion.findFirst({
    where: { slug, active: true },
    select: {
      name: true,
      slug: true,
      description: true,
      icon: true,
      seoTitle: true,
      metaDescription: true,
      _count: {
        select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } },
      },
    },
  });

  if (!occasion) return null;

  return occasion;
});

async function getRelatedOccasions(slugs: readonly string[]) {
  if (slugs.length === 0) return [];

  const occasions = await prisma.occasion.findMany({
    where: {
      active: true,
      slug: { in: [...slugs] },
      giftCards: { some: { giftCard: { status: "ACTIVE" } } },
    },
    select: { name: true, slug: true },
  });
  const bySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion]));

  return slugs.flatMap((slug) => {
    const occasion = bySlug.get(slug);
    return occasion ? [occasion] : [];
  });
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const occasion = await getOccasionPage(slug);

  if (!occasion) {
    return {
      title: "Περίσταση δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const landingContent = getOccasionLandingContent(occasion.slug);
  const fallbackTitle = `${occasion.name} – Ιδέες για δωροκάρτες`;
  const title = occasion.seoTitle
    ? { absolute: occasion.seoTitle }
    : landingContent?.seoTitle || fallbackTitle;
  const description =
    occasion.metaDescription ||
    landingContent?.metaDescription ||
    occasion.description ||
    `Ιδέες για δωροκάρτες για ${occasion.name}, συγκεντρωμένες στο Dorokartes.gr.`;
  const requestedPage = parsePublicPage(query.page);
  const totalPages = Math.max(1, Math.ceil(occasion._count.giftCards / PUBLIC_CATALOG_PAGE_SIZE));
  const canonicalPage = Math.min(requestedPage, totalPages);
  const basePath = `/occasions/${encodeURIComponent(occasion.slug)}`;
  const canonical = canonicalPage === 1 ? basePath : `${basePath}?page=${canonicalPage}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: requestedPage === 1 && occasion._count.giftCards > 0, follow: true },
    openGraph: { title: occasion.seoTitle || landingContent?.seoTitle || fallbackTitle, description, url: canonical },
  };
}

export default async function OccasionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const occasion = await getOccasionPage(slug);

  if (!occasion) notFound();

  const landingContent = getOccasionLandingContent(occasion.slug);
  const [cardPage, relatedOccasions] = await Promise.all([
    getPublicCardPage(
      {
        status: "ACTIVE",
        occasions: { some: { occasion: { slug, active: true } } },
      },
      parsePublicPage(query.page),
    ),
    getRelatedOccasions(landingContent?.relatedSlugs ?? []),
  ]);

  return (
    <TaxonomyLanding
      kind="occasion"
      name={occasion.name}
      slug={occasion.slug}
      heading={landingContent?.heading}
      description={landingContent?.intro || occasion.description}
      icon={occasion.icon}
      relatedOccasions={relatedOccasions}
      cards={cardPage.cards}
      totalCount={cardPage.totalCount}
      currentPage={cardPage.currentPage}
      totalPages={cardPage.totalPages}
    />
  );
}
