import Image from "next/image";
import Link from "next/link";

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
                {merchant.logoUrl ? (
                  <Image
                    src={merchant.logoUrl}
                    alt={`Λογότυπο ${merchant.name}`}
                    width={120}
                    height={70}
                    unoptimized
                  />
                ) : (
                  <span>{merchant.name.slice(0,2).toUpperCase()}</span>
                )}
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
