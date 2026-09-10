import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import GiftCardCard from "@/components/public/GiftCardCard";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import { prisma } from "@/lib/prisma";
import { publicCardSelect } from "@/lib/public/data";

export const dynamic = "force-dynamic";

const getBrandPage = cache((slug: string) =>
  prisma.merchant.findFirst({
    where: { slug, status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    select: {
      name: true,
      slug: true,
      description: true,
      websiteUrl: true,
      logoUrl: true,
      seoTitle: true,
      metaDescription: true,
      giftCards: {
        where: { status: "ACTIVE" },
        orderBy: [{ featured: "desc" }, { title: "asc" }],
        select: publicCardSelect,
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandPage(slug);

  if (!brand) {
    return {
      title: "Κατάστημα δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const title = brand.seoTitle ? { absolute: brand.seoTitle } : `${brand.name} – Δωροκάρτες`;
  const description =
    brand.metaDescription ||
    brand.description ||
    `Όλες οι ενεργές δωροκάρτες ${brand.name} στο Dorokartes.gr.`;
  const canonical = `/brands/${encodeURIComponent(brand.slug)}`;
  const indexable = brand.giftCards.some((card) => card.verificationStatus === "VERIFIED");
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      title: brand.seoTitle || `${brand.name} – Δωροκάρτες`,
      description,
      url: canonical,
      images: brand.logoUrl ? [{ url: brand.logoUrl, alt: brand.name }] : undefined,
    },
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandPage(slug);

  if (!brand) notFound();

  return (
    <div className="dk-public">
      <PublicHeader />

      <main className="dk25-taxonomy-page">
        <div className="dk20-shell">
          <nav className="dk24-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Αρχική</Link>
            <span>›</span>
            <Link href="/#brands">Καταστήματα</Link>
            <span>›</span>
            <b>{brand.name}</b>
          </nav>

          <section className="dk25-brand-hero">
            <div className="dk25-brand-logo">
              {brand.logoUrl ? (
                <Image
                  src={brand.logoUrl}
                  alt={`Λογότυπο ${brand.name}`}
                  width={180}
                  height={100}
                  unoptimized
                />
              ) : (
                <span>{brand.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="dk25-taxonomy-copy">
              <span>ΚΑΤΑΣΤΗΜΑ</span>
              <h1>{brand.name}</h1>
              <p>{brand.description || `Δες τις ενεργές δωροκάρτες από ${brand.name}.`}</p>
            </div>

            {brand.websiteUrl && (
              <a href={brand.websiteUrl} target="_blank" rel="noreferrer">
                Ιστότοπος καταστήματος <b>↗</b>
              </a>
            )}
          </section>

          <div className="dk25-taxonomy-results">
            <div>
              <span>ΕΝΕΡΓΕΣ ΕΠΙΛΟΓΕΣ</span>
              <h2>
                {brand.giftCards.length} {brand.giftCards.length === 1 ? "δωροκάρτα" : "δωροκάρτες"}
              </h2>
            </div>
            <Link href="/browse">Όλος ο κατάλογος <b>→</b></Link>
          </div>

          <div className="dk-public-card-grid dk-public-browse-grid">
            {brand.giftCards.map((card) => (
              <GiftCardCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
