"use client";

import type { ReactNode } from "react";
import { sendCatalogEvent, type CatalogEventContext } from "@/lib/public/catalog-analytics";

export default function CatalogOutboundLink({ context, children, className }: {
  context: CatalogEventContext & { giftCardId: string };
  children: ReactNode;
  className?: string;
}) {
  return <a
    href={`/go/${encodeURIComponent(context.giftCardId)}${context.pageType === "brand" ? "?from=brand" : ""}`}
    className={className}
    onClick={() => { sendCatalogEvent("catalog_outbound_click", context); }}
    onAuxClick={event => { if (event.button === 1) sendCatalogEvent("catalog_outbound_click", context); }}
  >{children}</a>;
}
