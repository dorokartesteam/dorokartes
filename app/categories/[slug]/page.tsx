import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import TaxonomyLanding from "@/components/public/TaxonomyLanding";
import { prisma } from "@/lib/prisma";
import { getCategoryLandingContent } from "@/lib/public/category-landing-content";
import { PUBLIC_CATALOG_PAGE_SIZE, getPublicCardPage, parsePublicPage } from "@/lib/public/data";

export const dynamic = "force-dynamic";

const getCategoryPage = cache(async (slug: string) => {
  const category = await prisma.category.findFirst({
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

  if (!category) return null;

  return category;
});

async function getRelatedCategories(slugs: readonly string[]) {
  if (slugs.length === 0) return [];

  const categories = await prisma.category.findMany({
    where: { active: true, slug: { in: [...slugs] } },
    select: { name: true, slug: true },
  });
  const bySlug = new Map(categories.map((category) => [category.slug, category]));

  return slugs.flatMap((slug) => {
    const category = bySlug.get(slug);
    return category ? [category] : [];
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
  const category = await getCategoryPage(slug);

  if (!category) {
    return {
      title: "Κατηγορία δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const landingContent = getCategoryLandingContent(category.slug);
  const fallbackTitle = `${category.name} – Δωροκάρτες`;
  const title = category.seoTitle
    ? { absolute: category.seoTitle }
    : landingContent?.seoTitle || fallbackTitle;
  const description =
    category.metaDescription ||
    landingContent?.metaDescription ||
    category.description ||
    `Δωροκάρτες στην κατηγορία ${category.name}, συγκεντρωμένες στο Dorokartes.gr.`;
  const requestedPage = parsePublicPage(query.page);
  const totalPages = Math.max(1, Math.ceil(category._count.giftCards / PUBLIC_CATALOG_PAGE_SIZE));
  const canonicalPage = Math.min(requestedPage, totalPages);
  const basePath = `/categories/${encodeURIComponent(category.slug)}`;
  const canonical = canonicalPage === 1 ? basePath : `${basePath}?page=${canonicalPage}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: requestedPage === 1 && category._count.giftCards > 0, follow: true },
    openGraph: { title: category.seoTitle || landingContent?.seoTitle || fallbackTitle, description, url: canonical },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryPage(slug);

  if (!category) notFound();

  const landingContent = getCategoryLandingContent(category.slug);
  const [cardPage, relatedCategories] = await Promise.all([
    getPublicCardPage(
      {
        status: "ACTIVE",
        categories: { some: { category: { slug, active: true } } },
      },
      parsePublicPage(query.page),
    ),
    getRelatedCategories(landingContent?.relatedSlugs ?? []),
  ]);

  return (
    <TaxonomyLanding
      kind="category"
      name={category.name}
      slug={category.slug}
      heading={landingContent?.heading}
      description={landingContent?.intro || category.description}
      icon={category.icon}
      relatedCategories={relatedCategories}
      cards={cardPage.cards}
      totalCount={cardPage.totalCount}
      currentPage={cardPage.currentPage}
      totalPages={cardPage.totalPages}
    />
  );
}
