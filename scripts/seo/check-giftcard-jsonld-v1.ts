import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const source = await fs.readFile(
    path.resolve(process.cwd(), "app", "gift-cards", "[slug]", "page.tsx"),
    "utf8"
  );

  const checks = {
    jsonLdHelper: source.includes("function jsonLd(value: unknown)"),
    jsonLdScript: source.includes('type="application/ld+json"'),
    productSchema: source.includes('"@type": "Product"'),
    breadcrumbSchema: source.includes('"@type": "BreadcrumbList"'),
    productId: source.includes('#product'),
    breadcrumbId: source.includes('#breadcrumbs'),
    brandSchema: source.includes('"@type": "Brand"'),
    canonicalCardUrl: source.includes('/gift-cards/'),
    brandUrl: source.includes('/brands/'),
    noFakeOffers: !source.includes('"@type": "Offer"'),
    noFakeRating: !source.includes("aggregateRating"),
    escapedJson: source.includes('replace(/</g, "\\\\u003c")'),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: gift-card structured-data checks failed.");
  }

  console.log("PASS: gift-card structured-data checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
