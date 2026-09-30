import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const source = await fs.readFile(
    path.resolve(process.cwd(), "app", "brands", "[slug]", "page.tsx"),
    "utf8"
  );

  const checks = {
    jsonLdHelper: source.includes("function jsonLd(value: unknown)"),
    baseUrlHelper: source.includes("function getBaseUrl()"),
    jsonLdScript: source.includes('type="application/ld+json"'),
    collectionPage: source.includes('"@type": "CollectionPage"'),
    itemList: source.includes('"@type": "ItemList"'),
    breadcrumbList: source.includes('"@type": "BreadcrumbList"'),
    numberOfItems: source.includes("numberOfItems: brand.giftCards.length"),
    giftCardUrls: source.includes('/gift-cards/'),
    brandUrl: source.includes('/brands/'),
    greekLanguage: source.includes('inLanguage: "el-GR"'),
    escapedJson: source.includes('replace(/</g, "\\\\u003c")'),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: brand structured-data checks failed.");
  }

  console.log("PASS: brand structured-data checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
