import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const file = path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx");
  const source = await fs.readFile(file, "utf8");

  const checks = {
    hasJsonLdScript: source.includes('type="application/ld+json"'),
    hasCollectionPage: source.includes('"@type": "CollectionPage"'),
    hasItemList: source.includes('"@type": "ItemList"'),
    hasListItem: source.includes('"@type": "ListItem"'),
    usesAbsoluteBaseUrl: source.includes("const base = getBaseUrl();"),
    linksGiftCards: source.includes("/gift-cards/${encodeURIComponent(card.slug)}"),
    numberOfItems: source.includes("numberOfItems: cards.length"),
    escapesHtml: source.includes('replace(/</g, "\\\\u003c")'),
    preservesNoindexThreshold: source.includes("region.count >= 3"),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: region JSON-LD static checks failed.");
  }

  console.log("PASS: region JSON-LD static checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
