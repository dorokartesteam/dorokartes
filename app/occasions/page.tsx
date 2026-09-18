import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import {
  occasionDisplayIcon,
  type OccasionItem,
} from "@/components/public/OccasionsSection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Περιστάσεις για δωροκάρτες",
  description: "Βρες ιδέες για δωροκάρτες ανά περίσταση: γενέθλια, γιορτή, επέτειος, νέο μωρό, εταιρικά δώρα και άλλα.",
  alternates: { canonical: "/occasions" },
  openGraph: {
    title: "Περιστάσεις για δωροκάρτες",
    description: "Βρες ιδέες για δωροκάρτες ανά περίσταση, από τον κατάλογο του Dorokartes.gr.",
    url: "/occasions",
  },
};

export default async function OccasionsPage() {
  const occasions: OccasionItem[] = await prisma.occasion.findMany({
    where: {
      active: true,
      giftCards: { some: { giftCard: { status: "ACTIVE" } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      _count: {
        select: {
          giftCards: { where: { giftCard: { status: "ACTIVE" } } },
        },
      },
    },
  });
  const mappedCards = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      occasions: { some: { occasion: { active: true } } },
    },
  });

  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk26-category-index">
        <div className="dk20-shell">
          <section className="dk27-category-hero dk29-occasion-hero">
            <div className="dk27-category-hero-copy">
              <span className="dk27-eyebrow">ΓΙΑ ΚΑΘΕ ΣΤΙΓΜΗ</span>
              <h1>Μία δωροκάρτα για κάθε περίσταση.</h1>
              <p>
                Ξεκίνα από τη στιγμή που θέλεις να γιορτάσεις και δες τις
                ενεργές επιλογές που έχουν ήδη αντιστοιχιστεί στον κατάλογο.
              </p>
              <div className="dk27-hero-actions">
                <a className="dk27-primary-action" href="#occasion-directory">
                  Δες τις περιστάσεις <b aria-hidden="true">↓</b>
                </a>
                <Link className="dk27-secondary-action" href="/browse">
                  Όλες οι δωροκάρτες <b aria-hidden="true">→</b>
                </Link>
              </div>
            </div>

            <aside className="dk27-catalog-snapshot" aria-label="Στοιχεία διαθέσιμων περιστάσεων">
              <div className="dk27-snapshot-topline">
                <span><i aria-hidden="true" /> ΖΩΝΤΑΝΟΣ ΚΑΤΑΛΟΓΟΣ</span>
                <b>Ενημερωμένος</b>
              </div>
              <p>Οι αριθμοί προέρχονται από τις ενεργές αντιστοιχίσεις του καταλόγου.</p>
              <div className="dk27-snapshot-stats">
                <div><b>{occasions.length}</b><span>περιστάσεις</span></div>
                <div><b>{mappedCards}</b><span>δωροκάρτες</span></div>
              </div>
            </aside>
          </section>

          <section className="dk27-category-directory" id="occasion-directory" aria-labelledby="occasion-directory-title">
            <div className="dk27-directory-heading">
              <div>
                <span>ΕΞΕΡΕΥΝΗΣΗ ΑΝΑ ΠΕΡΙΣΤΑΣΗ</span>
                <h2 id="occasion-directory-title">Όλες οι περιστάσεις</h2>
              </div>
              <p>Επίλεξε μία περίσταση για να δεις τις ήδη αντιστοιχισμένες δωροκάρτες.</p>
            </div>

            <div className="dk20-occasion-grid dk29-occasion-grid">
              {occasions.map((occasion, index) => {
                const count = occasion._count?.giftCards || 0;
                return (
                  <Link
                    key={occasion.id}
                    prefetch={false}
                    href={`/occasions/${occasion.slug}`}
                    className={`tone-${index % 6}`}
                  >
                    <div className="dk20-occasion-icon" aria-hidden="true">
                      {occasionDisplayIcon(occasion.icon)}
                    </div>
                    <b>{occasion.name}</b>
                    <span>{count} {count === 1 ? "δωροκάρτα" : "δωροκάρτες"}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
