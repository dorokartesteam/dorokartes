import type { Metadata } from "next";
import PublicHeader from "@/components/public/PublicHeader";
import PublicHero from "@/components/public/PublicHero";
import WhyDorokartes from "@/components/public/WhyDorokartes";
import CategoriesSection from "@/components/public/CategoriesSection";
import FeaturedCardsSection from "@/components/public/FeaturedCardsSection";
import OccasionsSection from "@/components/public/OccasionsSection";
import BrandsSection from "@/components/public/BrandsSection";
import GrowthSection from "@/components/public/GrowthSection";
import PublicFooter from "@/components/public/PublicFooter";
import { getHomeData } from "@/lib/public/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dorokartes.gr | Όλες οι δωροκάρτες σε ένα μέρος",
    description: "Ανακάλυψε δωροκάρτες από καταστήματα και υπηρεσίες στην Ελλάδα και συνέχισε στον ιστότοπο του εμπόρου.",
    url: "/",
  },
};

export default async function HomePage() {
  const data = await getHomeData();

  return (
    <div className="dk14-site">
      <PublicHeader />
      <main>
        <PublicHero totalCards={data.totalCards} />
        <WhyDorokartes />
        {data.categories.length > 0 && <CategoriesSection categories={data.categories} />}
        {data.cards.length > 0 && <FeaturedCardsSection cards={data.cards} />}
        {data.occasions.length > 0 && <OccasionsSection occasions={data.occasions} />}
        {data.merchants.length > 0 && <BrandsSection merchants={data.merchants} />}
        <GrowthSection />
      </main>
      <PublicFooter />
    </div>
  );
}
