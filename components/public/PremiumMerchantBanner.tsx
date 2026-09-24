"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MerchantLogo from "@/components/public/MerchantLogo";

export type PremiumMerchantSlide = {
  placementId: string;
  merchantId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  cardTitle: string | null;
  cardSlug: string | null;
};

function trackPlacement(placementId: string, action: "IMPRESSION" | "CLICK") {
  void fetch("/api/public/premium-placement/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ placementId, action }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function PremiumMerchantBanner({
  slides,
}: {
  slides: PremiumMerchantSlide[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const seenImpressions = useRef(new Set<string>());

  useEffect(() => {
    if (activeIndex >= slides.length) setActiveIndex(0);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[activeIndex];

  useEffect(() => {
    if (!slide || seenImpressions.current.has(slide.placementId)) return;
    seenImpressions.current.add(slide.placementId);
    trackPlacement(slide.placementId, "IMPRESSION");
  }, [slide]);

  if (!slide) return null;

  const brandHref = `/brands/${encodeURIComponent(slide.slug)}`;
  const cardHref = slide.cardSlug
    ? `/gift-cards/${encodeURIComponent(slide.cardSlug)}`
    : brandHref;

  return (
    <section className="dk-paid-premium-wrap" aria-label="Premium συνεργάτες Dorokartes">
      <div className="dk20-shell">
        <article className="dk-paid-premium-banner">
          <div className="dk-paid-premium-orb one" />
          <div className="dk-paid-premium-orb two" />

          <div className="dk-paid-premium-copy">
            <div className="dk-paid-premium-kicker">
              <span>PREMIUM ΠΡΟΒΟΛΗ</span>
              <em>Συνεργάτης Dorokartes</em>
            </div>

            <h2>{slide.name}</h2>
            <p>
              {slide.description ||
                (slide.cardTitle
                  ? `Ανακάλυψε τη ${slide.cardTitle} και συνέχισε στον επίσημο έμπορο.`
                  : `Ανακάλυψε τις διαθέσιμες δωροκάρτες από ${slide.name}.`)}
            </p>

            <div className="dk-paid-premium-actions">
              <Link
                href={cardHref}
                onClick={() => trackPlacement(slide.placementId, "CLICK")}
              >
                {slide.cardTitle ? "Δες τη δωροκάρτα" : "Δες το κατάστημα"}
                <b aria-hidden="true">→</b>
              </Link>
              <Link
                className="secondary"
                href={brandHref}
                onClick={() => trackPlacement(slide.placementId, "CLICK")}
              >
                Προφίλ καταστήματος
              </Link>
            </div>
          </div>

          <div className="dk-paid-premium-visual">
            <div className="dk-paid-premium-logo">
              <MerchantLogo name={slide.name} src={slide.logoUrl} variant="brand-hero" />
            </div>
            {slide.cardTitle ? <strong>{slide.cardTitle}</strong> : null}
          </div>

          {slides.length > 1 ? (
            <div className="dk-paid-premium-dots" aria-label="Premium banners">
              {slides.map((item, index) => (
                <button
                  key={item.placementId}
                  type="button"
                  className={index === activeIndex ? "active" : ""}
                  aria-label={`Προβολή ${item.name}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
