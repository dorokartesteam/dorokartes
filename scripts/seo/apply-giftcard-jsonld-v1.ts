import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "gift-cards", "[slug]", "page.tsx");

async function main() {
  const source = await fs.readFile(FILE, "utf8");

  if (
    source.includes('"@type": "Product"') &&
    source.includes('"@type": "BreadcrumbList"')
  ) {
    console.log("PASS: gift-card structured data already present. No changes needed.");
    return;
  }

  let updated = source;

  const helperAnchor = `function decodeSlug(slug: string) {`;
  if (!updated.includes(helperAnchor)) {
    throw new Error("STOP: decodeSlug anchor not found. File unchanged.");
  }

  if (!updated.includes("function jsonLd(value: unknown)")) {
    updated = updated.replace(
      helperAnchor,
      `function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\\\u003c");
}

${helperAnchor}`
    );
  }

  const pageAnchor = `  const relatedCards = await getRelatedCards({ ...card, merchantId: card.merchant.id });`;
  if (!updated.includes(pageAnchor)) {
    throw new Error("STOP: relatedCards anchor not found. File unchanged.");
  }

  const structuredDataBlock = `${pageAnchor}
  const baseUrl = getBaseUrl();
  const cardUrl = \`\${baseUrl}/gift-cards/\${encodeURIComponent(card.slug)}\`;
  const brandUrl = \`\${baseUrl}/brands/\${encodeURIComponent(card.merchant.slug)}\`;
  const structuredDescription =
    card.metaDescription?.trim() ||
    card.shortDescription?.trim() ||
    card.description?.trim() ||
    \`\${card.title} από \${card.merchant.name}\`;
  const primaryCategory = card.categories.find((item) => item.primary)?.category || card.categories[0]?.category;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": \`\${cardUrl}#product\`,
        name: card.title,
        description: structuredDescription,
        url: cardUrl,
        brand: {
          "@type": "Brand",
          name: card.merchant.name,
          url: brandUrl,
        },
        ...(card.merchant.logoUrl
          ? {
              image: new URL(card.merchant.logoUrl, \`\${baseUrl}/\`).toString(),
            }
          : {}),
        ...(primaryCategory
          ? {
              category: primaryCategory.name,
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": \`\${cardUrl}#breadcrumbs\`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Αρχική",
            item: \`\${baseUrl}/\`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Δωροκάρτες",
            item: \`\${baseUrl}/browse\`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: card.merchant.name,
            item: brandUrl,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: card.title,
            item: cardUrl,
          },
        ],
      },
    ],
  };`;

  updated = updated.replace(pageAnchor, structuredDataBlock);

  const returnAnchor = `    <div className="dk-public">
      <CatalogView {...analyticsContext} />`;

  if (!updated.includes(returnAnchor)) {
    throw new Error("STOP: page return anchor not found. File unchanged.");
  }

  updated = updated.replace(
    returnAnchor,
    `    <div className="dk-public">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <CatalogView {...analyticsContext} />`
  );

  const backup = FILE + ".before-giftcard-jsonld-v1";
  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(FILE, updated, "utf8");

  console.log("PASS: gift-card Product + BreadcrumbList JSON-LD added.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
