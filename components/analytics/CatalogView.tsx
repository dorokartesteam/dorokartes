"use client";

import { useEffect, useRef } from "react";
import { sendCatalogEvent, type CatalogEventContext } from "@/lib/public/catalog-analytics";

const SESSION_KEY = "dorokartes_catalog_session_v2";

function getAnonymousSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function sendFirstPartyView(context: CatalogEventContext) {
  try {
    void fetch("/api/analytics/catalog-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...context,
        sessionId: getAnonymousSessionId(),
      }),
    }).catch(() => undefined);
  } catch {
    // Analytics must never affect the public catalog experience.
  }
}

export default function CatalogView({
  merchantId,
  giftCardId,
  category,
  pageType,
  sourcePath,
}: CatalogEventContext) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${pageType}:${merchantId}:${giftCardId || ""}`;

    function track() {
      if (document.visibilityState !== "visible" || sent.current === key) return;

      // Mark first so visibility/analytics-ready events cannot create duplicate requests.
      sent.current = key;

      sendCatalogEvent("catalog_view", {
        merchantId,
        giftCardId,
        category,
        pageType,
        sourcePath,
      });

      sendFirstPartyView({
        merchantId,
        giftCardId,
        category,
        pageType,
        sourcePath,
      });
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
