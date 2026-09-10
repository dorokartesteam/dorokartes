import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import GiftCardCard from "@/components/public/GiftCardCard";
import PublicPagination from "@/components/public/PublicPagination";
import { prisma } from "@/lib/prisma";
import {
  browseCards,
  parsePublicPage,
  readPublicSearchParam,
} from "@/lib/public/data";

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

  const [cardPage, categories, activeOccasion] = await Promise.all([
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
  ]);
  const { cards, totalCount, currentPage, totalPages } = cardPage;

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
            <form className="dk14-search" action="/browse" method="get" role="search">
              <span className="dk14-search-icon" aria-hidden="true">⌕</span>
              <input
                name="q"
                defaultValue={q || ""}
                placeholder="Sephora, spa, gaming, παιδί, ρούχα..."
                aria-label="Αναζήτηση δωροκάρτας"
              />
              {category ? <input type="hidden" name="category" value={category} /> : null}
              {occasion ? <input type="hidden" name="occasion" value={occasion} /> : null}
              <button type="submit">Αναζήτηση</button>
            </form>
          </div>

          {activeOccasion ? (
            <div className="dk29-filter-context" aria-label="Ενεργό φίλτρο περίστασης">
              <span>Περίσταση: <b>{activeOccasion.name}</b></span>
              <Link
                prefetch={false}
                href={browseHref({ q, category })}
                aria-label={`Αφαίρεση φίλτρου περίστασης ${activeOccasion.name}`}
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
