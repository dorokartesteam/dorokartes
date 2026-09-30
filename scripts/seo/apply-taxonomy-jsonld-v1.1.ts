import fs from "node:fs/promises";
import path from "node:path";

type Config = {
  label: string;
  file: string;
  fallbackBasePath: string;
  indexPath: string;
  indexName: string;
};

const configs: Config[] = [
  {
    label: "category",
    file: path.resolve(process.cwd(), "app", "categories", "[slug]", "page.tsx"),
    fallbackBasePath: "/categories",
    indexPath: "/categories",
    indexName: "Κατηγορίες",
  },
  {
    label: "occasion",
    file: path.resolve(process.cwd(), "app", "occasions", "[slug]", "page.tsx"),
    fallbackBasePath: "/occasions",
    indexPath: "/occasions",
    indexName: "Περιστάσεις",
  },
];

const helperBlock = `function taxonomyJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\\\u003c");
}

const taxonomyFallbackBaseUrl = "https://dorokartes.gr";

function getTaxonomyBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || taxonomyFallbackBaseUrl;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return taxonomyFallbackBaseUrl;
    return url.toString().replace(/\\/+$/, "");
  } catch {
    return taxonomyFallbackBaseUrl;
  }
}

`;

function extractProp(block: string, prop: string): string | null {
  // prop="literal"
  let m = block.match(new RegExp(`${prop}="([^"]+)"`));
  if (m?.[1]) return JSON.stringify(m[1]);

  // prop={expression} -- intentionally handles the simple expressions used here.
  m = block.match(new RegExp(`${prop}=\\{([^\\n}]+)\\}`));
  if (m?.[1]) return m[1].trim();

  // prop={`template ${expression}`}
  m = block.match(new RegExp(prop + "=\\{(`[^\\n]+`)\\}"));
  if (m?.[1]) return m[1].trim();

  return null;
}

function findTaxonomyBlock(source: string) {
  const start = source.indexOf("<TaxonomyLanding");
  if (start < 0) return null;

  const end = source.indexOf("/>", start);
  if (end < 0) return null;

  return {
    start,
    end: end + 2,
    text: source.slice(start, end + 2),
  };
}

async function patch(config: Config) {
  const source = await fs.readFile(config.file, "utf8");

  if (
    source.includes('"@type": "CollectionPage"') &&
    source.includes('"@type": "ItemList"') &&
    source.includes('"@type": "BreadcrumbList"')
  ) {
    console.log(`PASS: ${config.label} structured data already present.`);
    return;
  }

  const taxonomy = findTaxonomyBlock(source);
  if (!taxonomy) {
    throw new Error(`STOP: TaxonomyLanding block not found in ${config.label} page. File unchanged.`);
  }

  const block = taxonomy.text;

  const cardsExpr = extractProp(block, "cards");
  const totalCountExpr = extractProp(block, "totalCount");
  const currentPageExpr = extractProp(block, "currentPage");
  const titleExpr = extractProp(block, "title") || extractProp(block, "heading");
  const introExpr = extractProp(block, "intro") || extractProp(block, "description");
  const basePathExpr = extractProp(block, "basePath");

  if (!cardsExpr || !currentPageExpr || !titleExpr || !introExpr) {
    console.error("Detected TaxonomyLanding block:\n", block);
    throw new Error(
      `STOP: could not resolve required TaxonomyLanding props in ${config.label} page. File unchanged.`
    );
  }

  let updated = source;

  if (!updated.includes("function taxonomyJsonLd(value: unknown)")) {
    const dynamicAnchor = 'export const dynamic = "force-dynamic";';
    if (!updated.includes(dynamicAnchor)) {
      throw new Error(`STOP: dynamic export anchor not found in ${config.label} page. File unchanged.`);
    }

    updated = updated.replace(dynamicAnchor, `${helperBlock}${dynamicAnchor}`);
  }

  // Re-find after helper insertion.
  const taxonomy2 = findTaxonomyBlock(updated);
  if (!taxonomy2) {
    throw new Error(`STOP: TaxonomyLanding disappeared in ${config.label} page. File unchanged.`);
  }

  const returnIndex = updated.lastIndexOf("return (", taxonomy2.start);
  if (returnIndex < 0) {
    throw new Error(`STOP: return statement not found in ${config.label} page. File unchanged.`);
  }

  const pathExpression =
    basePathExpr ||
    `\`${config.fallbackBasePath}/\${encodeURIComponent(
      String((${titleExpr}) ?? "").toLowerCase().replace(/\\s+/g, "-")
    )}\``;

  const structuredBlock = `const taxonomyBaseUrl = getTaxonomyBaseUrl();
  const taxonomyPath = ${pathExpression};
  const taxonomyRootUrl = \`\${taxonomyBaseUrl}\${taxonomyPath}\`;
  const taxonomyPageUrl =
    ${currentPageExpr} > 1
      ? \`\${taxonomyRootUrl}?page=\${${currentPageExpr}}\`
      : taxonomyRootUrl;
  const taxonomyName = ${titleExpr};
  const taxonomyDescription = ${introExpr};
  const taxonomyPositionOffset =
    (${currentPageExpr} - 1) * PUBLIC_CATALOG_PAGE_SIZE;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": \`\${taxonomyPageUrl}#collection\`,
        name: taxonomyName,
        description: taxonomyDescription,
        url: taxonomyPageUrl,
        inLanguage: "el-GR",
        mainEntity: {
          "@id": \`\${taxonomyPageUrl}#itemlist\`,
        },
      },
      {
        "@type": "ItemList",
        "@id": \`\${taxonomyPageUrl}#itemlist\`,
        name: taxonomyName,
        numberOfItems: ${totalCountExpr || `${cardsExpr}.length`},
        itemListElement: ${cardsExpr}.map((card, index) => ({
          "@type": "ListItem",
          position: taxonomyPositionOffset + index + 1,
          name: card.title,
          url: \`\${taxonomyBaseUrl}/gift-cards/\${encodeURIComponent(card.slug)}\`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": \`\${taxonomyPageUrl}#breadcrumbs\`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Αρχική",
            item: \`\${taxonomyBaseUrl}/\`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "${config.indexName}",
            item: \`\${taxonomyBaseUrl}${config.indexPath}\`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: taxonomyName,
            item: taxonomyRootUrl,
          },
        ],
      },
    ],
  };

  `;

  updated =
    updated.slice(0, returnIndex) +
    structuredBlock +
    updated.slice(returnIndex);

  // Re-find taxonomy after insertion and wrap its direct return.
  const taxonomy3 = findTaxonomyBlock(updated);
  if (!taxonomy3) {
    throw new Error(`STOP: TaxonomyLanding block missing before wrapping ${config.label}. File unchanged.`);
  }

  const returnStart = updated.lastIndexOf("return (", taxonomy3.start);
  if (returnStart < 0) {
    throw new Error(`STOP: return statement missing before wrapping ${config.label}. File unchanged.`);
  }

  const close = updated.indexOf(");", taxonomy3.end);
  if (close < 0) {
    throw new Error(`STOP: return terminator not found in ${config.label} page. File unchanged.`);
  }

  const oldReturn = updated.slice(returnStart, close + 2);
  if (!oldReturn.includes("<TaxonomyLanding")) {
    throw new Error(`STOP: expected TaxonomyLanding direct return not found in ${config.label}. File unchanged.`);
  }

  const wrappedReturn = `return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: taxonomyJsonLd(structuredData) }}
      />
      ${taxonomy3.text}
    </>
  );`;

  updated =
    updated.slice(0, returnStart) +
    wrappedReturn +
    updated.slice(close + 2);

  const backup = config.file + ".before-taxonomy-jsonld-v1.1";
  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(config.file, updated, "utf8");

  console.log(`PASS: ${config.label} structured data added.`);
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), config.file));
}

async function main() {
  for (const config of configs) {
    await patch(config);
  }

  console.log("PASS: category + occasion structured-data patch completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
