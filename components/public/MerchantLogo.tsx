"use client";

import Image from "next/image";
import { useState } from "react";

type MerchantLogoVariant = "card" | "detail" | "brand-tile" | "brand-hero" | "location";

type MerchantLogoProps = {
  name: string;
  src: string | null;
  variant: MerchantLogoVariant;
};

const imageDimensions: Record<MerchantLogoVariant, { width: number; height: number; sizes?: string }> = {
  card: { width: 220, height: 120, sizes: "(max-width: 720px) 60vw, 220px" },
  detail: { width: 260, height: 150 },
  "brand-tile": { width: 120, height: 70 },
  "brand-hero": { width: 180, height: 100 },
  location: { width: 52, height: 52 },
};

function initials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length > 1) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "GC";
}

export default function MerchantLogo({ name, src, variant }: MerchantLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    const dimensions = imageDimensions[variant];
    return (
      <Image
        src={src}
        alt=""
        width={dimensions.width}
        height={dimensions.height}
        sizes={dimensions.sizes}
        unoptimized
        onError={() => setFailedSrc(src)}
      />
    );
  }

  const compact = variant === "brand-tile" || variant === "brand-hero" || variant === "location";
  const lengthClass = name.length > 36 ? "is-very-long" : name.length > 22 ? "is-long" : "";
  return (
    <div
      className={`dk-merchant-wordmark dk-merchant-wordmark--${variant} ${lengthClass}`.trim()}
      aria-hidden="true"
    >
      <strong>{compact ? initials(name) : name}</strong>
      {!compact && <small>ΔΩΡΟΚΑΡΤΑ</small>}
    </div>
  );
}
