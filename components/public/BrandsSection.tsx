import Link from "next/link";
import MerchantLogo from "@/components/public/MerchantLogo";

type MerchantItem = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  _count?: { giftCards?: number };
};

export default function BrandsSection({
  merchants,
}: {
  merchants: MerchantItem[];
}) {
  return (
    <section className="dk20-section dk20-brands" id="brands">
      <div className="dk20-shell">
        <div className="dk20-heading-row">
          <div>
            <div className="dk20-section-eyebrow">
              ΔΗΜΟΦΙΛΗ BRANDS & ΚΑΤΑΣΤΗΜΑΤΑ
            </div>
            <h2>Δωροκάρτες από brands που γνωρίζεις</h2>
            <p>
              Ανακάλυψε διαθέσιμες δωροκάρτες και συνέχισε στην επίσημη
              σελίδα του καταστήματος.
            </p>
          </div>

          <Link href="/browse">
            Δες όλο τον κατάλογο <span>→</span>
          </Link>
        </div>

        <div className="dk20-brand-grid">
          {merchants.slice(0, 14).map((merchant, index) => (
            <Link
              key={merchant.id}
              prefetch={false}
              href={`/brands/${merchant.slug}`}
              className={`tone-${index % 6}`}
            >
              <div className="dk20-brand-logo">
                <MerchantLogo
                  name={merchant.name}
                  src={merchant.logoUrl}
                  variant="brand-tile"
                />
              </div>

              <b>{merchant.name}</b>
              <small>
                {merchant._count?.giftCards || 0}{" "}
                {(merchant._count?.giftCards || 0) === 1
                  ? "δωροκάρτα"
                  : "δωροκάρτες"}
              </small>
              <em aria-hidden="true">→</em>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
