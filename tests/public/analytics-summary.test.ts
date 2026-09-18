import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeOutboundClicks } from "../../lib/admin/analytics-summary";

test("click totals include deleted entities and attribute exactly one primary category", () => {
  const result = summarizeOutboundClicks([
    { merchantId: "m", giftCardId: "a", _count: { _all: 8 } },
    { merchantId: "m", giftCardId: "b", _count: { _all: 3 } },
    { merchantId: null, giftCardId: null, _count: { _all: 2 } },
  ], [
    { id: "a", title: "Card A", categories: [{ primary: true, category: { id: "cat", name: "Beauty" } }, { primary: false, category: { id: "other", name: "Other" } }] },
    { id: "b", title: "Card B", categories: [] },
  ], [{ id: "m", name: "Merchant" }]);
  assert.equal(result.clicks, 13);
  assert.equal(result.merchants[0].count, 11);
  assert.equal(result.cards[0].id, "a");
  assert.deepEqual(result.categories.map(row => [row.id, row.count]), [["cat", 8], ["unknown", 5]]);
  for (const rows of [result.cards, result.merchants, result.categories]) assert.equal(rows.reduce((sum, row) => sum + row.count, 0), result.clicks);
});

test("empty analytics are zero and ties have deterministic order", () => {
  assert.equal(summarizeOutboundClicks([], [], []).clicks, 0);
  const result = summarizeOutboundClicks([
    { merchantId: "z", giftCardId: "b", _count: { _all: 1 } },
    { merchantId: "a", giftCardId: "a", _count: { _all: 1 } },
  ], [], []);
  assert.deepEqual(result.merchants.map(row => row.id), ["a", "z"]);
});
