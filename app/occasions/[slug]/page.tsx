import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import TaxonomyLanding from "@/components/public/TaxonomyLanding";
import { prisma } from "@/lib/prisma";
import { getPublicCardPage, parsePublicPage } from "@/lib/public/data";

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
    },
  });

  if (!occasion) return null;

  return occasion;
});

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

  const title = occasion.seoTitle ? { absolute: occasion.seoTitle } : `${occasion.name} – Ιδέες για δωροκάρτες`;
  const description =
    occasion.metaDescription ||
    occasion.description ||
    `Ιδέες για δωροκάρτες για ${occasion.name}, συγκεντρωμένες στο Dorokartes.gr.`;
  const canonical = `/occasions/${encodeURIComponent(occasion.slug)}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: parsePublicPage(query.page) === 1, follow: true },
    openGraph: { title: occasion.seoTitle || `${occasion.name} – Ιδέες για δωροκάρτες`, description, url: canonical },
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

  const cardPage = await getPublicCardPage(
    {
      status: "ACTIVE",
      occasions: { some: { occasion: { slug, active: true } } },
    },
    parsePublicPage(query.page),
  );

  return (
    <TaxonomyLanding
      kind="occasion"
      name={occasion.name}
      slug={occasion.slug}
      description={occasion.description}
      icon={occasion.icon}
      cards={cardPage.cards}
      totalCount={cardPage.totalCount}
      currentPage={cardPage.currentPage}
      totalPages={cardPage.totalPages}
    />
  );
}
