import assert from "node:assert/strict";
import { test } from "node:test";
import { getMerchantProfileDetails, publicHttpUrl } from "../../lib/public/merchant-profile";

test("profile links include only verified, distinct, usable destinations", () => {
  const base = { id: "a", title: "Gift card", officialUrl: "https://merchant.example/gift", verificationStatus: "VERIFIED", categories: [], occasions: [] };
  const result = getMerchantProfileDetails([
    base, { ...base, id: "duplicate" },
    { ...base, id: "unverified", verificationStatus: "DISCOVERED", officialUrl: "https://merchant.example/other" },
    { ...base, id: "invalid", officialUrl: "javascript:alert(1)" },
  ]);
  assert.equal(result.verifiedCount, 3);
  assert.deepEqual(result.officialCards.map(card => card.id), ["a"]);
});

test("website links reject credentials and non-HTTP destinations", () => {
  for (const url of [null, "invalid", "javascript:alert(1)", "https://user:secret@example.com"]) assert.equal(publicHttpUrl(url), null);
  assert.equal(publicHttpUrl("https://merchant.example"), "https://merchant.example/");
});

test("profile taxonomy links are unique across cards", () => {
  const card = { id: "a", title: "Gift", officialUrl: null, verificationStatus: "DISCOVERED", categories: [{ category: { name: "Beauty", slug: "beauty" } }], occasions: [{ occasion: { name: "Birthday", slug: "birthday" } }] };
  const result = getMerchantProfileDetails([card, { ...card, id: "b" }]);
  assert.equal(result.categories.length, 1);
  assert.equal(result.occasions.length, 1);
  assert.equal(result.officialCards.length, 0);
});
