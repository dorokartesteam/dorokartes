import type { Metadata } from "next";
import CategoryGrid from "@/components/public/CategoryGrid";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Κατηγορίες δωροκαρτών",
  description:
    "Ανακάλυψε δωροκάρτες ανά κατηγορία: μόδα, ομορφιά, ταξίδια, gaming, φαγητό, wellness και άλλα.",
  alternates: { canonical: "/categories" },
  openGraph: {
    title: "Κατηγορίες δωροκαρτών",
    description:
      "Ανακάλυψε δωροκάρτες ανά κατηγορία: μόδα, ομορφιά, ταξίδια, gaming, φαγητό, wellness και άλλα.",
    url: "/categories",
  },
};

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    where: { active: true },
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
            id="category-directory"
            aria-labelledby="category-directory-title"
          >
            <div className="dk27-directory-heading">
              <div>
                <span>ΕΞΕΡΕΥΝΗΣΗ ΑΝΑ ΕΝΔΙΑΦΕΡΟΝ</span>
                <h1 id="category-directory-title">Όλες οι κατηγορίες</h1>
              </div>
            </div>

            <CategoryGrid categories={categories} />
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
