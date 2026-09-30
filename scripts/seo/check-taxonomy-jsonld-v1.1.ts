import fs from "node:fs/promises";
import path from "node:path";

const targets = [
  {
    route: "category",
    file: path.resolve(process.cwd(), "app", "categories", "[slug]", "page.tsx"),
  },
  {
    route: "occasion",
    file: path.resolve(process.cwd(), "app", "occasions", "[slug]", "page.tsx"),
  },
];

async function main() {
  const rows: Record<string, unknown>[] = [];

  for (const target of targets) {
    const source = await fs.readFile(target.file, "utf8");

    rows.push({
      route: target.route,
      jsonLdHelper: source.includes("function taxonomyJsonLd(value: unknown)"),
      baseUrlHelper: source.includes("function getTaxonomyBaseUrl()"),
      jsonLdScript: source.includes('type="application/ld+json"'),
      collectionPage: source.includes('"@type": "CollectionPage"'),
      itemList: source.includes('"@type": "ItemList"'),
      breadcrumbList: source.includes('"@type": "BreadcrumbList"'),
      giftCardUrls: source.includes('/gift-cards/'),
      pageAwareUrl: source.includes("?page="),
      pageAwarePositions: source.includes("taxonomyPositionOffset + index + 1"),
      visibleCardsMapped: source.includes(".map((card, index) =>"),
      greekLanguage: source.includes('inLanguage: "el-GR"'),
      preservesTaxonomyLanding: source.includes("<TaxonomyLanding"),
      noFakeOffers: !source.includes('"@type": "Offer"'),
      noFakeRating: !source.includes("aggregateRating"),
    });
  }

  console.table(rows);

  const failed = rows.some((row) =>
    Object.entries(row)
      .filter(([key]) => key !== "route")
      .some(([, value]) => value !== true)
  );

  if (failed) {
    throw new Error("STOP: taxonomy structured-data v1.1 checks failed.");
  }

  console.log("PASS: category + occasion structured-data v1.1 checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
