import Image from "next/image";
import Link from "next/link";
import type { PublicCard } from "@/lib/public/data";

export default function GiftCardCard({ card }: { card: PublicCard }) {
  const category =
    card.categories?.find((x) => x.primary)?.category ||
    card.categories?.[0]?.category;

  const merchantLogo = card.merchant?.logoUrl || null;

  return (
    <article className="dk24-giftcard">
      <Link prefetch={false} href={`/gift-cards/${card.slug}`} className="dk24-giftcard-link">
        <div className="dk24-logo-visual">
          <div className="dk24-logo-glow one" />
          <div className="dk24-logo-glow two" />

          <div className="dk24-logo-center">
            {merchantLogo ? (
              <Image
                src={merchantLogo}
                alt={`Λογότυπο ${card.merchant?.name || "εμπόρου"}`}
                width={220}
                height={120}
                sizes="(max-width: 720px) 60vw, 220px"
                unoptimized
              />
            ) : (
              <div className="dk24-initials">
                {card.merchant?.name?.slice(0, 2).toUpperCase() || "GC"}
              </div>
            )}
          </div>

          <div className="dk24-visual-top">
            <span>{category?.name || "Δωροκάρτα"}</span>
            {card.verificationStatus === "VERIFIED" && <em>✓ Επιβεβαιωμένη</em>}
          </div>
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
