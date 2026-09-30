import fs from "node:fs/promises";
import path from "node:path";

type Check = {
  route: string;
  file: string;
  exists: boolean;
  generateMetadata: boolean;
  staticMetadata: boolean;
  canonical: boolean;
  robots: boolean;
  openGraph: boolean;
  twitter: boolean;
  jsonLd: boolean;
  breadcrumbJsonLd: boolean;
  itemListJsonLd: boolean;
  pagination: boolean;
};

const TARGETS = [
  { route: "/brands/[slug]", file: "app/brands/[slug]/page.tsx" },
  { route: "/categories/[slug]", file: "app/categories/[slug]/page.tsx" },
  { route: "/occasions/[slug]", file: "app/occasions/[slug]/page.tsx" },
  { route: "/gift-cards/[slug]", file: "app/gift-cards/[slug]/page.tsx" },
  { route: "/regions/[slug]", file: "app/regions/[slug]/page.tsx" },
  { route: "/browse", file: "app/browse/page.tsx" },
  { route: "/categories", file: "app/categories/page.tsx" },
  { route: "/occasions", file: "app/occasions/page.tsx" },
  { route: "/regions", file: "app/regions/page.tsx" },
];

async function readMaybe(rel: string) {
  try {
    return await fs.readFile(path.resolve(process.cwd(), rel), "utf8");
  } catch {
    return null;
  }
}

function inspect(route: string, file: string, source: string | null): Check {
  const s = source ?? "";
  return {
    route,
    file,
    exists: source !== null,
    generateMetadata: s.includes("generateMetadata"),
    staticMetadata: /export\s+const\s+metadata\s*:?\s*Metadata?/.test(s) || s.includes("export const metadata"),
    canonical: s.includes("canonical"),
    robots: s.includes("robots:"),
    openGraph: s.includes("openGraph"),
    twitter: s.includes("twitter"),
    jsonLd: s.includes('application/ld+json'),
    breadcrumbJsonLd: s.includes('"@type": "BreadcrumbList"'),
    itemListJsonLd: s.includes('"@type": "ItemList"'),
    pagination: s.includes("<PublicPagination") || s.includes("parsePublicPage"),
  };
}

async function main() {
  const results: Check[] = [];

  for (const target of TARGETS) {
    const source = await readMaybe(target.file);
    results.push(inspect(target.route, target.file, source));
  }

  console.log("\n=== PUBLIC SEO ROUTE AUDIT v1 ===\n");
  console.table(results);

  const sitemap = await readMaybe("app/sitemap.ts");
  const robots = await readMaybe("app/robots.ts");

  const globalChecks = {
    sitemapExists: Boolean(sitemap),
    sitemapBrands: Boolean(sitemap?.includes("/brands/")),
    sitemapCategories: Boolean(sitemap?.includes("/categories/")),
    sitemapOccasions: Boolean(sitemap?.includes("/occasions/")),
    sitemapRegions: Boolean(sitemap?.includes("/regions/")),
    sitemapGiftCards: Boolean(sitemap?.includes("/gift-cards/")),
    robotsExists: Boolean(robots),
    robotsReferencesSitemap: Boolean(robots?.includes("/sitemap.xml")),
    robotsBlocksAdmin: Boolean(robots?.includes("/admin")),
  };

  console.log("\n=== GLOBAL SEO CHECKS ===\n");
  console.table(globalChecks);

  const gaps = results.flatMap((r) => {
    const issues: string[] = [];
    if (!r.exists) issues.push("missing route file");
    if (!(r.generateMetadata || r.staticMetadata)) issues.push("no metadata");
    if (!r.canonical) issues.push("no canonical");
    if (!r.openGraph) issues.push("no OpenGraph");
    return issues.map((issue) => ({ route: r.route, issue }));
  });

  console.log("\n=== PRIORITY GAPS ===\n");
  if (gaps.length) console.table(gaps);
  else console.log("No basic metadata/canonical/OpenGraph gaps detected.");

  const report = {
    generatedAt: new Date().toISOString(),
    routes: results,
    global: globalChecks,
    priorityGaps: gaps,
  };

  const reportDir = path.resolve(process.cwd(), "reports", "seo");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "public-seo-audit-v1.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nReport:", path.relative(process.cwd(), reportPath));
  console.log("PASS: read-only SEO audit completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
