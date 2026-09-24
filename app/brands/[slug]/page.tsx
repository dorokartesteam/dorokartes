import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import GiftCardCard from "@/components/public/GiftCardCard";
import MerchantLogo from "@/components/public/MerchantLogo";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import { prisma } from "@/lib/prisma";
import { publicCardSelect } from "@/lib/public/data";
import { getMerchantProfileDetails, publicHttpUrl } from "@/lib/public/merchant-profile";
import CatalogView from "@/components/analytics/CatalogView";
import CatalogOutboundLink from "@/components/analytics/CatalogOutboundLink";
import { merchantPartnerBadge, merchantPublicTier } from "@/lib/public/merchant-entitlements";

export const dynamic = "force-dynamic";

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

const getBrandPage = cache((slug: string) =>
  prisma.merchant.findFirst({
    where: { slug: decodeSlug(slug), status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      websiteUrl: true,
      logoUrl: true,
      seoTitle: true,
      metaDescription: true,
      subscription: { select: { plan: true, status: true, endsAt: true } },
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

  const profile = getMerchantProfileDetails(brand.giftCards);
  const websiteUrl = publicHttpUrl(brand.websiteUrl);
  const partnerTier = merchantPublicTier(brand.subscription);
  const partnerBadge = merchantPartnerBadge(partnerTier);
  const analyticsContext = { merchantId: brand.id, pageType: "brand" as const, sourcePath: `/brands/${encodeURIComponent(brand.slug)}` };

  return (
    <div className="dk-public">
      <CatalogView {...analyticsContext} />
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
              <MerchantLogo name={brand.name} src={brand.logoUrl} variant="brand-hero" />
            </div>

            <div className="dk25-taxonomy-copy">
              <span>ΚΑΤΑΣΤΗΜΑ</span>
              {partnerBadge ? <em className="dk-paid-profile-badge">✓ {partnerBadge}</em> : null}
              <h1>{brand.name}</h1>
              <p>{brand.description || `Δες τις ενεργές δωροκάρτες από ${brand.name}.`}</p>
              <p>{profile.verifiedCount > 0
                ? `Δωροκάρτες με επιβεβαιωμένα στοιχεία: ${profile.verifiedCount} από ${brand.giftCards.length}.`
                : "Τα στοιχεία των δωροκαρτών δεν έχουν επιβεβαιωθεί ακόμη."}</p>
            </div>

            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noreferrer">
                Ιστότοπος καταστήματος <b>↗</b>
              </a>
            )}
          </section>

          {profile.officialCards.length > 0 && (
            <section className="dk24-info-card" aria-labelledby="brand-official-links">
              <h2 id="brand-official-links">Επίσημες σελίδες δωροκαρτών</h2>
              <div className="dk24-link-stack">
                {profile.officialCards.map(card => (
                  <CatalogOutboundLink key={card.id} context={{ ...analyticsContext, giftCardId: card.id, category: card.categories[0]?.category.slug }}>
                    {card.title} <b>↗</b>
                  </CatalogOutboundLink>
                ))}
              </div>
            </section>
          )}

          {profile.categories.length > 0 && (
            <nav className="dk-public-filter-row" aria-label="Κατηγορίες καταστήματος">
              {profile.categories.map(category => <Link key={category.slug} prefetch={false} href={`/browse?category=${encodeURIComponent(category.slug)}`}>{category.name}</Link>)}
            </nav>
          )}
          {profile.occasions.length > 0 && (
            <nav className="dk-public-filter-row" aria-label="Περιστάσεις καταστήματος">
              {profile.occasions.map(occasion => <Link key={occasion.slug} prefetch={false} href={`/browse?occasion=${encodeURIComponent(occasion.slug)}`}>{occasion.name}</Link>)}
            </nav>
          )}

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
