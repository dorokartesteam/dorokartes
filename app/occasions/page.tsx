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
  description:
    "Βρες ιδέες για δωροκάρτες ανά περίσταση: γενέθλια, γιορτή, επέτειος, νέο μωρό, εταιρικά δώρα και άλλα.",
  alternates: { canonical: "/occasions" },
  openGraph: {
    title: "Περιστάσεις για δωροκάρτες",
    description:
      "Βρες ιδέες για δωροκάρτες ανά περίσταση, από τον κατάλογο του Dorokartes.gr.",
    url: "/occasions",
  },
};

export default async function OccasionsPage() {
  const occasions: OccasionItem[] = await prisma.occasion.findMany({
    where: {
      active: true,
      giftCards: {
        some: { giftCard: { status: "ACTIVE" } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      _count: {
        select: {
          giftCards: {
            where: { giftCard: { status: "ACTIVE" } },
          },
        },
      },
    },
  });

  return (
    <div className="dk-public">
      <PublicHeader />

      <main className="dk26-category-index">
        <div className="dk20-shell">
          <section
            className="dk27-category-directory"
            id="occasion-directory"
            aria-labelledby="occasion-directory-title"
          >
            <div className="dk27-directory-heading">
              <div>
                <span>ΕΞΕΡΕΥΝΗΣΗ ΑΝΑ ΠΕΡΙΣΤΑΣΗ</span>
                <h1 id="occasion-directory-title">Όλες οι περιστάσεις</h1>
              </div>
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
                    <div
                      className="dk20-occasion-icon"
                      aria-hidden="true"
                    >
                      {occasionDisplayIcon(occasion.icon)}
                    </div>

                    <b>{occasion.name}</b>
                    <span>
                      {count} {count === 1 ? "δωροκάρτα" : "δωροκάρτες"}
                    </span>
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
