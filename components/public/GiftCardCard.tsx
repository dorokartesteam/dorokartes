import Link from "next/link";
import type { PublicCard } from "@/lib/public/data";
import MerchantLogo from "@/components/public/MerchantLogo";
import {
  merchantPartnerBadge,
  merchantPublicTier,
} from "@/lib/public/merchant-entitlements";

export default function GiftCardCard({ card }: { card: PublicCard }) {
  const category =
    card.categories?.find((x) => x.primary)?.category ||
    card.categories?.[0]?.category;

  const merchantLogo = card.merchant?.logoUrl || null;
  const tier = merchantPublicTier(card.merchant?.subscription);
  const partnerBadge = merchantPartnerBadge(tier);
  const tierClass = tier ? `dk-paid-${tier.toLowerCase().replaceAll("_", "-")}` : "";

  return (
    <article className={`dk24-giftcard ${tierClass}`.trim()}>
      <Link prefetch={false} href={`/gift-cards/${card.slug}`} className="dk24-giftcard-link">
        <div className="dk24-logo-visual">
          <div className="dk24-logo-glow one" />
          <div className="dk24-logo-glow two" />

          <div className="dk24-logo-center">
            <MerchantLogo
              name={card.merchant?.name || "Gift Card"}
              src={merchantLogo}
              variant="card"
            />
          </div>

          <div className="dk24-visual-top">
            <span>{category?.name || "Δωροκάρτα"}</span>
            {card.verificationStatus === "VERIFIED" && <em>✓ Επιβεβαιωμένη</em>}
          </div>

          {partnerBadge ? (
            <div className="dk-paid-card-badge" aria-label={`Εμπορικό πακέτο ${partnerBadge}`}>
              <i aria-hidden="true">✓</i>
              {partnerBadge}
            </div>
          ) : null}
        </div>

        <div className="dk24-giftcard-body">
          <span className="dk24-card-eyebrow">ΔΩΡΟΚΑΡΤΑ</span>
          <h3>{card.merchant?.name}</h3>
          <p>{card.title}</p>

          <div className="dk24-card-footer">
            <span>Δες τη δωροκάρτα</span>
            <b>→</b>
          </div>
        </div>
      </Link>
    </article>
  );
}
