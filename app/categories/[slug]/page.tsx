import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import TaxonomyLanding from "@/components/public/TaxonomyLanding";
import { prisma } from "@/lib/prisma";
import { getPublicCardPage, parsePublicPage } from "@/lib/public/data";

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
    },
  });

  if (!category) return null;

  return category;
});

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

  const title = category.seoTitle ? { absolute: category.seoTitle } : `${category.name} – Δωροκάρτες`;
  const description =
    category.metaDescription ||
    category.description ||
    `Δωροκάρτες στην κατηγορία ${category.name}, συγκεντρωμένες στο Dorokartes.gr.`;
  const canonical = `/categories/${encodeURIComponent(category.slug)}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: parsePublicPage(query.page) === 1, follow: true },
    openGraph: { title: category.seoTitle || `${category.name} – Δωροκάρτες`, description, url: canonical },
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

  const cardPage = await getPublicCardPage(
    {
      status: "ACTIVE",
      categories: { some: { category: { slug, active: true } } },
    },
    parsePublicPage(query.page),
  );

  return (
    <TaxonomyLanding
      kind="category"
      name={category.name}
      slug={category.slug}
      description={category.description}
      icon={category.icon}
      cards={cardPage.cards}
      totalCount={cardPage.totalCount}
      currentPage={cardPage.currentPage}
      totalPages={cardPage.totalPages}
    />
  );
}
