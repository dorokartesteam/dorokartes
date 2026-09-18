export type CatalogEventContext = {
  merchantId: string;
  giftCardId?: string;
  category?: string;
  pageType: "brand" | "gift_card";
  sourcePath: string;
};

type AnalyticsWindow = Window & {
  gtag?: (command: "event", name: string, parameters: Record<string, string>) => void;
};

export function sendCatalogEvent(name: "catalog_view" | "catalog_outbound_click", context: CatalogEventContext) {
  if (typeof window === "undefined") return false;
  const target = window as AnalyticsWindow;
  if (!["dorokartes.gr", "www.dorokartes.gr"].includes(target.location.hostname.toLowerCase()) || !target.gtag) return false;
  try {
    target.gtag("event", name, {
      merchant_id: context.merchantId,
      ...(context.giftCardId ? { gift_card_id: context.giftCardId } : {}),
      ...(context.category ? { catalog_category: context.category } : {}),
      page_type: context.pageType,
      source_path: context.sourcePath,
    });
    return true;
  } catch {
    return false;
  }
}
