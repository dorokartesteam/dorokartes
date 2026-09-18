import Link from "next/link";
import MerchantLogo from "@/components/public/MerchantLogo";

type MerchantItem = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  _count?: { giftCards?: number };
};

export default function BrandsSection({ merchants }: { merchants: MerchantItem[] }) {
  return (
    <section className="dk20-section dk20-brands" id="brands">
      <div className="dk20-shell">
        <div className="dk20-heading-row">
          <div>
            <div className="dk20-section-eyebrow">BRANDS & ΚΑΤΑΣΤΗΜΑΤΑ</div>
            <h2>Από πού θέλεις να χαρίσεις;</h2>
            <p>Μπες στο προφίλ του καταστήματος και δες τις διαθέσιμες δωροκάρτες.</p>
          </div>
        </div>

        <div className="dk20-brand-grid">
          {merchants.slice(0, 14).map((merchant, index) => (
            <Link key={merchant.id} prefetch={false} href={`/brands/${merchant.slug}`} className={`tone-${index % 6}`}>
              <div className="dk20-brand-logo">
                <MerchantLogo name={merchant.name} src={merchant.logoUrl} variant="brand-tile" />
              </div>
              <b>{merchant.name}</b>
              <small>{merchant._count?.giftCards || 0} δωροκάρτες</small>
              <em>→</em>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
