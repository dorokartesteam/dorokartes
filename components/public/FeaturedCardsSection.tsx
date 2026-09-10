import Link from "next/link";
import GiftCardCard from "@/components/public/GiftCardCard";
import type { PublicCard } from "@/lib/public/data";

export default function FeaturedCardsSection({ cards }: { cards: PublicCard[] }) {
  return (
    <section className="dk20-section dk20-featured">
      <div className="dk20-shell">
        <div className="dk20-heading-row">
          <div>
            <div className="dk20-section-eyebrow">ΔΩΡΟΚΑΡΤΕΣ</div>
            <h2>Πρόσφατα ενημερωμένες επιλογές</h2>
            <p>Νέες και πρόσφατα ελεγμένες καταχωρήσεις από τον ζωντανό κατάλογο.</p>
          </div>
          <Link href="/browse">Δες όλες <span>→</span></Link>
        </div>

        <div className="dk20-card-grid">
          {cards.slice(0, 9).map((card) => (
            <GiftCardCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
