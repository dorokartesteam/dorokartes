import Link from "next/link";
import MerchantLogo from "@/components/public/MerchantLogo";
import { merchantPartnerBadge, merchantPublicTier } from "@/lib/public/merchant-entitlements";

type RegionLocationCardProps = {
  distanceKm?: number | null;
  location: {
    id: string;
    label: string | null;
    addressLine: string;
    postalCode: string | null;
    city: string;
    area: string | null;
    sourceUrl: string;
    merchant: {
      name: string;
      slug: string;
      logoUrl: string | null;
      subscription: { plan: string; status: string; endsAt: Date | string | null } | null;
      _count: { giftCards: number };
      giftCards: Array<{
        id: string;
        title: string;
        slug: string;
        categories: Array<{ category: { name: string } }>;
      }>;
    };
    giftCardCapabilities: Array<{
      giftCardId: string;
      capability: "PURCHASE_IN_STORE" | "REDEEM_IN_STORE";
      giftCard: {
        id: string;
        title: string;
        slug: string;
        categories: Array<{ category: { name: string } }>;
      };
    }>;
  };
};

export default function RegionLocationCard({ location, distanceKm }: RegionLocationCardProps) {
  const card =
    location.giftCardCapabilities[0]?.giftCard ||
    location.merchant.giftCards[0];
  if (!card) return null;

  const category = card.categories[0]?.category.name || "Δωροκάρτα";
  const purchasable = location.giftCardCapabilities.some(
    (capability) => capability.capability === "PURCHASE_IN_STORE",
  );
  const redeemable = location.giftCardCapabilities.some(
    (capability) => capability.capability === "REDEEM_IN_STORE",
  );
  const cardCount = location.merchant._count.giftCards;
  const tier = merchantPublicTier(location.merchant.subscription);
  const partnerBadge = merchantPartnerBadge(tier);
  const cardsHref = cardCount > 1
    ? `/brands/${location.merchant.slug}`
    : `/gift-cards/${card.slug}`;

  return (
    <article className={`dk28-location-card ${tier ? `dk-paid-${tier.toLowerCase().replaceAll("_", "-")}` : ""}`.trim()}>
      <div className="dk28-location-brand">
        <div className="dk28-location-logo">
          <MerchantLogo name={location.merchant.name} src={location.merchant.logoUrl} variant="location" />
        </div>
        <div>
          <span>{cardCount > 1 ? `${cardCount} διαθέσιμες δωροκάρτες` : category}</span>
          <h3>{location.merchant.name}</h3>
          {partnerBadge ? <em className="dk-paid-location-badge">✓ {partnerBadge}</em> : null}
          {location.label && location.label !== location.merchant.name ? <p>{location.label}</p> : null}
        </div>
      </div>

      <div className="dk28-location-address">
        <span aria-hidden="true">⌖</span>
        <div>
          <b>{location.city}{location.area ? ` · ${location.area}` : ""}</b>
          <p>{location.addressLine}{location.postalCode ? `, ${location.postalCode}` : ""}</p>
          {distanceKm != null ? <em>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} μ.` : `${distanceKm.toFixed(1)} χλμ.`} από εσένα</em> : null}
        </div>
      </div>

      <div className="dk28-capability-row" aria-label="Επιβεβαιωμένες δυνατότητες δωροκάρτας στο σημείο">
        {purchasable ? <span className="confirmed">✓ Επιβεβαιωμένη αγορά στο σημείο</span> : null}
        {redeemable ? <span className="confirmed">✓ Επιβεβαιωμένη εξαργύρωση στο σημείο</span> : null}
        {!purchasable && !redeemable ? <span>Διαθεσιμότητα στο σημείο: υπό επιβεβαίωση</span> : null}
      </div>

      <div className="dk28-location-actions">
        <Link prefetch={false} href={cardsHref}>
          {cardCount > 1 ? `Δες ${cardCount} δωροκάρτες` : "Δες τη δωροκάρτα"} <b aria-hidden="true">→</b>
        </Link>
        <a href={location.sourceUrl} target="_blank" rel="noreferrer nofollow">
          Πηγή διεύθυνσης <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
