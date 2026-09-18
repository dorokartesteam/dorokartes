import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCatalogText, rankCatalogSearch, rankRelatedCards, type CatalogSearchCard, type RelatedCard } from "../../lib/public/catalog-search";

function card(id: string, name: string, extra: Partial<CatalogSearchCard> = {}): CatalogSearchCard {
  return { id, merchant: { name }, title: `${name} Gift Card`, shortDescription: null, featured: false, verificationStatus: "VERIFIED", categories: [], occasions: [], ...extra };
}
const beauty = { category: { name: "Καλλυντικά", slug: "beauty" } };
const birthday = { occasion: { name: "Γενέθλια", slug: "birthday" } };
const cards = [
  card("noise", "AAA Gifts", { featured: true, shortDescription: "More options like Sephora" }),
  card("sephora", "Sephora", { categories: [beauty], occasions: [birthday] }),
  card("gaming", "Game Shop", { categories: [{ category: { name: "Gaming", slug: "gaming" } }], occasions: [birthday] }),
  card("spa", "Calm", { categories: [{ category: { name: "Spa", slug: "spa" } }] }),
  card("parts", "Spareparts", { featured: true }),
];

test("exact merchant outranks featured description mentions", () => {
  assert.equal(rankCatalogSearch(cards, "SEPHORA").ids[0], "sephora");
});
test("Greek accents, casing and final sigma normalize", () => {
  assert.equal(normalizeCatalogText("ΚΌΣΜΟΣ"), normalizeCatalogText("κοσμος"));
  assert.deepEqual(rankCatalogSearch(cards, "καλλυντικα").ids, ["sephora"]);
});
test("category and occasion terms combine instead of returning either", () => {
  assert.deepEqual(rankCatalogSearch(cards, "gaming birthday").ids, ["gaming"]);
  assert.equal(rankCatalogSearch(cards, "γενεθλια").ids.length, 2);
  assert.deepEqual(rankCatalogSearch(cards, "gaming nonexistent").ids, []);
});
test("transposed merchant letters use explicitly marked fallback", () => {
  assert.deepEqual(rankCatalogSearch(cards, "sephroa"), { ids: ["sephora"], approximate: true });
  assert.equal(rankCatalogSearch(cards, "sephora").approximate, false);
});
test("short queries do not fuzzy-match unrelated stores", () => {
  assert.deepEqual(rankCatalogSearch(cards, "qq").ids, []);
  assert.equal(rankCatalogSearch(cards, "spa").ids[0], "spa");
});
test("imported archive headings do not dominate a generic category query", () => {
  const rows = [...cards, card("archive", "Archives - Wellness Spa", { featured: true })];
  assert.equal(rankCatalogSearch(rows, "spa").ids[0], "spa");
});
test("punctuation in brand names and empty inputs are handled", () => {
  assert.deepEqual(rankCatalogSearch([card("hm", "H&M")], "hm").ids, ["hm"]);
  assert.deepEqual(rankCatalogSearch(cards, "!!!").ids, []);
  assert.deepEqual(rankCatalogSearch(cards, "a".repeat(161)).ids, []);
});
test("ties are stable and verified cards lead identical relevance", () => {
  const rows = [card("b", "Test", { featured: true, verificationStatus: "NEEDS_REVIEW" }), card("a", "Test")];
  assert.deepEqual(rankCatalogSearch(rows, "test").ids, ["a", "b"]);
  assert.deepEqual(rankCatalogSearch([...rows].reverse(), "test").ids, ["a", "b"]);
});
test("related cards exclude self, unrelated cards and repeated brands", () => {
  const current: RelatedCard = { id: "self", merchantId: "a", verificationStatus: "VERIFIED", categories: [{ primary: true, category: { slug: "beauty" } }], occasions: [birthday] };
  const related = (id: string, merchantId: string, categories = current.categories, occasions = current.occasions): RelatedCard => ({ ...current, id, merchantId, categories, occasions });
  assert.deepEqual(rankRelatedCards(current, [current, related("b1", "b"), related("b2", "b"), related("c", "c", []), related("none", "n", [], [])]), ["b1", "c"]);
});
