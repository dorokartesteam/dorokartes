import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import GiftCardCard from "@/components/public/GiftCardCard";
import PublicPagination from "@/components/public/PublicPagination";
import HeroSearch from "@/components/public/HeroSearch";
import { prisma } from "@/lib/prisma";
import {
  browseCards,
  parsePublicPage,
  readPublicSearchParam,
} from "@/lib/public/data";
import { CATEGORY_LANDING_SLUGS } from "@/lib/public/category-landing-content";
import {
  OCCASION_LANDING_SLUGS,
  isOccasionLandingReadyForIndexing,
} from "@/lib/public/occasion-landing-content";

export const dynamic = "force-dynamic";

type BrowseQuery = {
  q?: string;
  category?: string;
  occasion?: string;
};

type BrowseSearchParams = {
  q?: string | string[];
  category?: string | string[];
  occasion?: string | string[];
  page?: string | string[];
};

function browseHref({ q, category, occasion }: BrowseQuery) {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (occasion) query.set("occasion", occasion);
  const suffix = query.toString();
  return suffix ? `/browse?${suffix}` : "/browse";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = readPublicSearchParam(params.q);
  const category = readPublicSearchParam(params.category);
  const occasion = readPublicSearchParam(params.occasion);
  const page = parsePublicPage(params.page);
  const filtered = Boolean(q || category || occasion || page > 1);

  return {
    title: q ? `Αναζήτηση «${q}» – Δωροκάρτες` : "Όλες οι δωροκάρτες",
    description: "Αναζήτησε και σύγκρινε ενεργές δωροκάρτες ανά κατάστημα, κατηγορία και περίσταση.",
    alternates: { canonical: "/browse" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  const params = await searchParams;
  const q = readPublicSearchParam(params.q);
  const category = readPublicSearchParam(params.category);
  const occasion = readPublicSearchParam(params.occasion);
  const requestedPage = parsePublicPage(params.page);
  const showLandingLinks = !q && !category && !occasion && requestedPage === 1;

  const [cardPage, categories, activeOccasion, landingOccasions] = await Promise.all([
    browseCards({ q, category, occasion }, requestedPage),
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } },
      },
    }),
    occasion
      ? prisma.occasion.findFirst({
          where: { slug: occasion, active: true },
          select: { name: true, slug: true },
        })
      : Promise.resolve(null),
    showLandingLinks
      ? prisma.occasion.findMany({
          where: {
            active: true,
            slug: {
              in: OCCASION_LANDING_SLUGS.filter(isOccasionLandingReadyForIndexing),
            },
            giftCards: { some: { giftCard: { status: "ACTIVE" } } },
          },
          select: { name: true, slug: true },
        })
      : Promise.resolve([]),
  ]);

  const { cards, totalCount, currentPage, totalPages, approximate } = cardPage;
  const categoryBySlug = new Map(categories.map((item) => [item.slug, item]));
  const landingCategories = CATEGORY_LANDING_SLUGS.flatMap((slug) => {
    const item = categoryBySlug.get(slug);
    return item && item._count.giftCards > 0 ? [item] : [];
  });
  const occasionBySlug = new Map(landingOccasions.map((item) => [item.slug, item]));
  const orderedLandingOccasions = OCCASION_LANDING_SLUGS
    .filter(isOccasionLandingReadyForIndexing)
    .flatMap((slug) => {
      const item = occasionBySlug.get(slug);
      return item ? [item] : [];
    });

  return (
    <div className="dk-public">
      <PublicHeader />

      <main className="dk-public-browse">
        <div className="dk-public-shell">
          <div className="dk-public-browse-head">
            <span>ΚΑΤΑΛΟΓΟΣ</span>
            <h1>Όλες οι δωροκάρτες</h1>
            <p className="dk29-pagination-summary">
              {totalCount.toLocaleString("el-GR")} αποτελέσματα με τα τρέχοντα φίλτρα
              {totalPages > 1 ? ` · Σελίδα ${currentPage} από ${totalPages}` : ""}.
            </p>

            {approximate ? (
              <p role="status">
                Δεν βρέθηκε ακριβής αντιστοίχιση. Εμφανίζουμε κοντινά αποτελέσματα.
              </p>
            ) : null}

            <HeroSearch initial={q || ""} category={category} occasion={occasion} />

            {q ? (
              <Link
                className="dk-catalog-reset"
                prefetch={false}
                href={browseHref({ category, occasion })}
              >
                Καθαρισμός αναζήτησης ×
              </Link>
            ) : null}
          </div>

          {occasion ? (
            <div className="dk29-filter-context" aria-label="Ενεργό φίλτρο περίστασης">
              <span>
                Περίσταση: <b>{activeOccasion?.name || occasion}</b>
              </span>
              <Link
                prefetch={false}
                href={browseHref({ q, category })}
                aria-label={`Αφαίρεση φίλτρου περίστασης ${activeOccasion?.name || occasion}`}
              >
                Καθαρισμός ×
              </Link>
            </div>
          ) : null}

          <div className="dk-public-filter-row">
            <Link
              prefetch={false}
              className={!category ? "active" : ""}
              aria-current={!category ? "page" : undefined}
              href={browseHref({ q, occasion })}
            >
              Όλες
            </Link>

            {categories.map((c) => {
              return (
                <Link
                  key={c.slug}
                  prefetch={false}
                  className={category === c.slug ? "active" : ""}
                  aria-current={category === c.slug ? "page" : undefined}
                  href={browseHref({ q, category: c.slug, occasion })}
                >
                  {c.name} <span>{c._count.giftCards}</span>
                </Link>
              );
            })}
          </div>

          {showLandingLinks && (landingCategories.length || orderedLandingOccasions.length) ? (
            <section className="dk31-browse-landings" aria-labelledby="browse-landings-title">
              <div>
                <span>ΘΕΜΑΤΙΚΗ ΕΞΕΡΕΥΝΗΣΗ</span>
                <h2 id="browse-landings-title">Δωροκάρτες ανά κατηγορία και περίσταση</h2>
                <p>Μπες στις επιμελημένες σελίδες για να συγκρίνεις σχετικές επιλογές.</p>
              </div>
              <div className="dk31-browse-landing-groups">
                {landingCategories.length ? (
                  <div>
                    <b>Κατηγορίες</b>
                    <nav className="dk-public-filter-row" aria-label="Σελίδες κατηγοριών">
                      {landingCategories.map((item) => (
                        <Link
                          key={item.slug}
                          prefetch={false}
                          href={`/categories/${encodeURIComponent(item.slug)}`}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </nav>
                  </div>
                ) : null}
                {orderedLandingOccasions.length ? (
                  <div>
                    <b>Περιστάσεις</b>
                    <nav className="dk-public-filter-row" aria-label="Σελίδες περιστάσεων">
                      {orderedLandingOccasions.map((item) => (
                        <Link
                          key={item.slug}
                          prefetch={false}
                          href={`/occasions/${encodeURIComponent(item.slug)}`}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </nav>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {cards.length ? (
            <div className="dk-public-card-grid dk-public-browse-grid">
              {cards.map((card) => (
                <GiftCardCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="dk-public-empty">
              <b>Δεν βρήκαμε δωροκάρτες με αυτά τα φίλτρα.</b>
              <p>Δοκίμασε διαφορετικό brand, κατηγορία ή λέξη-κλειδί.</p>
              <Link href="/browse">Δες όλες τις δωροκάρτες</Link>
            </div>
          )}

          <PublicPagination
            basePath="/browse"
            currentPage={currentPage}
            totalPages={totalPages}
            query={{ q, category, occasion }}
            ariaLabel="Σελιδοποίηση καταλόγου δωροκαρτών"
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
