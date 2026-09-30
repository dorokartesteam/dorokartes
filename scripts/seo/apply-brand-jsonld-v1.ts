import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "brands", "[slug]", "page.tsx");

async function main() {
  const source = await fs.readFile(FILE, "utf8");

  if (
    source.includes('"@type": "CollectionPage"') &&
    source.includes('"@type": "ItemList"') &&
    source.includes('"@type": "BreadcrumbList"')
  ) {
    console.log("PASS: brand structured data already present. No changes needed.");
    return;
  }

  let updated = source;

  const decodeAnchor = `function decodeSlug(slug: string) {`;
  if (!updated.includes(decodeAnchor)) {
    throw new Error("STOP: decodeSlug anchor not found. File unchanged.");
  }

  if (!updated.includes("function jsonLd(value: unknown)")) {
    updated = updated.replace(
      decodeAnchor,
      `function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\\\u003c");
}

const fallbackBaseUrl = "https://dorokartes.gr";

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackBaseUrl;
    return url.toString().replace(/\\/+$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

${decodeAnchor}`
    );
  }

  const pageStart = `export default async function BrandPage({`;
  const pageIndex = updated.indexOf(pageStart);
  if (pageIndex < 0) {
    throw new Error("STOP: BrandPage function not found. File unchanged.");
  }

  const afterPage = updated.slice(pageIndex);
  const brandFetchMatch = afterPage.match(/const\s+brand\s*=\s*await\s+getBrandPage\([^)]+\);/);
  if (!brandFetchMatch) {
    throw new Error("STOP: brand fetch statement not found. File unchanged.");
  }

  const brandFetch = brandFetchMatch[0];
  const insertionAnchor = `${brandFetch}

  if (!brand) notFound();`;

  if (!updated.includes(insertionAnchor)) {
    throw new Error("STOP: brand notFound anchor not found. File unchanged.");
  }

  const structuredBlock = `${brandFetch}

  if (!brand) notFound();

  const baseUrl = getBaseUrl();
  const brandUrl = \`\${baseUrl}/brands/\${encodeURIComponent(brand.slug)}\`;
  const description =
    brand.metaDescription?.trim() ||
    brand.description?.trim() ||
    \`Δες τις διαθέσιμες δωροκάρτες από \${brand.name} στο Dorokartes.gr.\`;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": \`\${brandUrl}#collection\`,
        name: brand.name,
        description,
        url: brandUrl,
        inLanguage: "el-GR",
        mainEntity: {
          "@id": \`\${brandUrl}#itemlist\`,
        },
      },
      {
        "@type": "ItemList",
        "@id": \`\${brandUrl}#itemlist\`,
        name: \`Δωροκάρτες \${brand.name}\`,
        numberOfItems: brand.giftCards.length,
        itemListElement: brand.giftCards.map((card, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: card.title,
          url: \`\${baseUrl}/gift-cards/\${encodeURIComponent(card.slug)}\`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": \`\${brandUrl}#breadcrumbs\`,
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
            name: brand.name,
            item: brandUrl,
          },
        ],
      },
    ],
  };`;

  updated = updated.replace(insertionAnchor, structuredBlock);

  const returnIndex = updated.indexOf("  return (", updated.indexOf(pageStart));
  if (returnIndex < 0) {
    throw new Error("STOP: BrandPage return not found. File unchanged.");
  }

  const divIndex = updated.indexOf('<div className="dk-public">', returnIndex);
  if (divIndex < 0) {
    throw new Error("STOP: brand page root div not found. File unchanged.");
  }

  const divEnd = divIndex + '<div className="dk-public">'.length;
  updated =
    updated.slice(0, divEnd) +
    `
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />` +
    updated.slice(divEnd);

  const backup = FILE + ".before-brand-jsonld-v1";
  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(FILE, updated, "utf8");

  console.log("PASS: brand CollectionPage + ItemList + BreadcrumbList JSON-LD added.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
