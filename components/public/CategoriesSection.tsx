import Link from "next/link";
import CategoryGrid from "@/components/public/CategoryGrid";
import type { CategoryItem } from "@/components/public/CategoryGrid";

export default function CategoriesSection({ categories }: { categories: CategoryItem[] }) {
  return (
    <section className="dk20-section dk20-categories" id="categories">
      <div className="dk20-shell">
        <div className="dk20-heading-row">
          <div>
            <div className="dk20-section-eyebrow">ΑΝΑΚΑΛΥΨΗ</div>
            <h2>Τι δώρο ψάχνεις;</h2>
            <p>Ξεκίνα από αυτό που ενδιαφέρει τον άνθρωπο που θέλεις να κάνεις δώρο.</p>
          </div>
          <Link href="/categories">Όλες οι κατηγορίες <span>→</span></Link>
        </div>
        <CategoryGrid categories={categories} />
      </div>
    </section>
  );
}
