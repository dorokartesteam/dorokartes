"use client";

import { useEffect, useRef } from "react";
import { sendCatalogEvent, type CatalogEventContext } from "@/lib/public/catalog-analytics";

export default function CatalogView({ merchantId, giftCardId, category, pageType, sourcePath }: CatalogEventContext) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    const key = `${pageType}:${merchantId}:${giftCardId || ""}`;
    function track() {
      if (document.visibilityState !== "visible" || sent.current === key) return;
      if (sendCatalogEvent("catalog_view", { merchantId, giftCardId, category, pageType, sourcePath })) sent.current = key;
    }
    track();
    window.addEventListener("dorokartes:analytics-ready", track);
    document.addEventListener("visibilitychange", track);
    return () => {
      window.removeEventListener("dorokartes:analytics-ready", track);
      document.removeEventListener("visibilitychange", track);
    };
  }, [merchantId, giftCardId, category, pageType, sourcePath]);
  return null;
}
