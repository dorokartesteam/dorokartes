import type { Metadata } from "next";
import Link from "next/link";
import CategoryGrid from "@/components/public/CategoryGrid";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Κατηγορίες δωροκαρτών",
  description: "Ανακάλυψε δωροκάρτες ανά κατηγορία: μόδα, ομορφιά, ταξίδια, gaming, φαγητό, wellness και άλλα.",
  alternates: { canonical: "/categories" },
  openGraph: {
    title: "Κατηγορίες δωροκαρτών",
    description: "Ανακάλυψε δωροκάρτες ανά κατηγορία: μόδα, ομορφιά, ταξίδια, gaming, φαγητό, wellness και άλλα.",
    url: "/categories",
  },
};

export default async function CategoriesPage() {
  const [categories, activeCards, categorizedCards] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        _count: { select: { giftCards: { where: { giftCard: { status: "ACTIVE" } } } } },
      },
    }),
    prisma.giftCard.count({ where: { status: "ACTIVE" } }),
    prisma.giftCard.count({
      where: {
        status: "ACTIVE",
        categories: { some: { category: { active: true } } },
      },
    }),
  ]);

  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk26-category-index">
        <div className="dk20-shell">
          <section className="dk27-category-hero">
            <div className="dk27-category-hero-copy">
              <span className="dk27-eyebrow">ΟΛΕΣ ΟΙ ΚΑΤΗΓΟΡΙΕΣ</span>
              <h1>Το σωστό δώρο ξεκινά από κάτι που αγαπά.</h1>
              <p>
                Εξερεύνησε μόδα, ομορφιά, ταξίδια, gaming, φαγητό, εμπειρίες και ακόμη
                περισσότερες επιλογές από τον πραγματικό κατάλογο του Dorokartes.
              </p>
              <div className="dk27-hero-actions">
                <a className="dk27-primary-action" href="#category-directory">
                  Δες τις κατηγορίες <b aria-hidden="true">↓</b>
                </a>
                <Link className="dk27-secondary-action" href="/browse">
                  Όλες οι δωροκάρτες <b aria-hidden="true">→</b>
                </Link>
              </div>
            </div>

            <aside className="dk27-catalog-snapshot" aria-label="Στοιχεία ζωντανού καταλόγου">
              <div className="dk27-snapshot-topline">
                <span><i aria-hidden="true" /> ΖΩΝΤΑΝΟΣ ΚΑΤΑΛΟΓΟΣ</span>
                <b>Ενημερωμένος</b>
              </div>
              <p>Οι αριθμοί προέρχονται απευθείας από τις ενεργές εγγραφές του καταλόγου.</p>
              <div className="dk27-snapshot-stats">
                <div><b>{categories.length}</b><span>κατηγορίες</span></div>
                <div><b>{categorizedCards}</b><span>με κατηγορία</span></div>
                <div><b>{activeCards}</b><span>ενεργές κάρτες</span></div>
              </div>
            </aside>
          </section>

          <section className="dk27-category-directory" id="category-directory" aria-labelledby="category-directory-title">
            <div className="dk27-directory-heading">
              <div>
                <span>ΕΞΕΡΕΥΝΗΣΗ ΑΝΑ ΕΝΔΙΑΦΕΡΟΝ</span>
                <h2 id="category-directory-title">Όλες οι κατηγορίες</h2>
              </div>
              <p>Επίλεξε μία κατηγορία για να δεις τις ενεργές δωροκάρτες της.</p>
            </div>
            <CategoryGrid categories={categories} />
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
