import assert from "node:assert/strict";
import { test } from "node:test";
import { sendCatalogEvent } from "../../lib/public/catalog-analytics";

const context = { merchantId: "merchant", giftCardId: "card", category: "beauty", pageType: "gift_card" as const, sourcePath: "/gift-cards/card" };

test("events are gated to the production host and an initialized GA tag", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events: unknown[][] = [];
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "localhost" }, gtag: (...args: unknown[]) => events.push(args) } });
    assert.equal(sendCatalogEvent("catalog_view", context), false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "dorokartes.gr" } } });
    assert.equal(sendCatalogEvent("catalog_view", context), false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "dorokartes.gr" }, gtag: (...args: unknown[]) => events.push(args) } });
    assert.equal(sendCatalogEvent("catalog_view", context), true);
    assert.equal(sendCatalogEvent("catalog_outbound_click", context), true);
    assert.equal(events.length, 2);
    assert.deepEqual(events[0], ["event", "catalog_view", { merchant_id: "merchant", gift_card_id: "card", catalog_category: "beauty", page_type: "gift_card", source_path: "/gift-cards/card" }]);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "dorokartes.gr" }, gtag: () => { throw new Error("blocked"); } } });
    assert.equal(sendCatalogEvent("catalog_outbound_click", context), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
