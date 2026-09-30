import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import sitemap from "../../app/sitemap";
import {
  CATEGORY_LANDING_SLUGS,
} from "../../lib/public/category-landing-content";
import {
  OCCASION_LANDING_SLUGS,
  isOccasionLandingReadyForIndexing,
} from "../../lib/public/occasion-landing-content";
import {
  getRegionOptions,
} from "../../lib/regions/region-assignment";

type Issue = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  code: string;
  count?: number;
  details?: unknown;
};

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "seo", "production-seo-audit-v2.json");

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function expectedBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || "https://dorokartes.gr";
  try {
    const url = new URL(configured);
    return cleanBaseUrl(url.toString());
  } catch {
    return "https://dorokartes.gr";
  }
}

function duplicateValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

async function sourceAudit() {
  const targets = [
    ["gift-card", "app/gift-cards/[slug]/page.tsx"],
    ["brand", "app/brands/[slug]/page.tsx"],
    ["category", "app/categories/[slug]/page.tsx"],
    ["occasion", "app/occasions/[slug]/page.tsx"],
    ["region", "app/regions/[slug]/page.tsx"],
    ["browse", "app/browse/page.tsx"],
  ] as const;

  const rows = [];

  for (const [route, relative] of targets) {
    const file = path.join(ROOT, relative);
    const source = await fs.readFile(file, "utf8");

    rows.push({
      route,
      file: relative,
      canonical: source.includes("canonical"),
      robots: source.includes("robots"),
      openGraph: source.includes("openGraph"),
      jsonLd: source.includes('application/ld+json'),
      collectionPage: source.includes('"@type": "CollectionPage"'),
      itemList: source.includes('"@type": "ItemList"'),
      product: source.includes('"@type": "Product"'),
      breadcrumbList: source.includes('"@type": "BreadcrumbList"'),
      pagination:
        source.includes("PublicPagination") ||
        source.includes("?page=") ||
        source.includes("searchParams"),
    });
  }

  return rows;
}

async function main() {
  const base = expectedBaseUrl();

  const [
    verifiedCards,
    activeCardsTotal,
    brands,
    categories,
    occasions,
    generatedSitemap,
    regionOptions,
    sourceRoutes,
  ] = await Promise.all([
    prisma.giftCard.findMany({
      where: {
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
      },
      orderBy: [{ slug: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        merchantId: true,
        merchant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        categories: {
          where: { category: { active: true } },
          select: {
            category: { select: { slug: true, name: true } },
          },
        },
        occasions: {
          where: { occasion: { active: true } },
          select: {
            occasion: { select: { slug: true, name: true } },
          },
        },
      },
    }),
    prisma.giftCard.count({
      where: { status: "ACTIVE" },
    }),
    prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        giftCards: {
          some: {
            status: "ACTIVE",
            verificationStatus: "VERIFIED",
          },
        },
      },
      orderBy: { slug: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            giftCards: {
              where: {
                status: "ACTIVE",
                verificationStatus: "VERIFIED",
              },
            },
          },
        },
      },
    }),
    prisma.category.findMany({
      where: {
        active: true,
        giftCards: {
          some: {
            giftCard: {
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
            },
          },
        },
      },
      orderBy: { slug: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            giftCards: {
              where: {
                giftCard: {
                  status: "ACTIVE",
                  verificationStatus: "VERIFIED",
                },
              },
            },
          },
        },
      },
    }),
    prisma.occasion.findMany({
      where: {
        active: true,
        giftCards: {
          some: {
            giftCard: {
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
            },
          },
        },
      },
      orderBy: { slug: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            giftCards: {
              where: {
                giftCard: {
                  status: "ACTIVE",
                  verificationStatus: "VERIFIED",
                },
              },
            },
          },
        },
      },
    }),
    sitemap(),
    getRegionOptions(),
    sourceAudit(),
  ]);

  const sitemapUrls = generatedSitemap.map((entry) => normalizeUrl(String(entry.url)));
  const sitemapSet = new Set(sitemapUrls);

  const expectedGiftCardUrls = verifiedCards.map(
    (card) => `${base}/gift-cards/${encodeURIComponent(card.slug)}`,
  );

  const expectedBrandUrls = brands.map(
    (brand) => `${base}/brands/${encodeURIComponent(brand.slug)}`,
  );

  const categorySlugSet = new Set(CATEGORY_LANDING_SLUGS);
  const expectedCategoryUrls = categories
    .filter((category) => categorySlugSet.has(category.slug))
    .map((category) => `${base}/categories/${encodeURIComponent(category.slug)}`);

  const indexableOccasionSlugSet = new Set(
    OCCASION_LANDING_SLUGS.filter(isOccasionLandingReadyForIndexing),
  );
  const expectedOccasionUrls = occasions
    .filter((occasion) => indexableOccasionSlugSet.has(occasion.slug))
    .map((occasion) => `${base}/occasions/${encodeURIComponent(occasion.slug)}`);

  const expectedRegionUrls = regionOptions
    .filter((region) => region.count >= 3)
    .map((region) => `${base}/regions/${encodeURIComponent(region.slug)}`);

  const allExpectedPublicUrls = [
    base,
    `${base}/browse`,
    `${base}/categories`,
    `${base}/occasions`,
    `${base}/regions`,
    ...expectedGiftCardUrls,
    ...expectedBrandUrls,
    ...expectedCategoryUrls,
    ...expectedOccasionUrls,
    ...expectedRegionUrls,
  ];

  const missingGiftCardsFromSitemap = expectedGiftCardUrls.filter((url) => !sitemapSet.has(url));
  const missingBrandsFromSitemap = expectedBrandUrls.filter((url) => !sitemapSet.has(url));
  const missingCategoriesFromSitemap = expectedCategoryUrls.filter((url) => !sitemapSet.has(url));
  const missingOccasionsFromSitemap = expectedOccasionUrls.filter((url) => !sitemapSet.has(url));
  const missingRegionsFromSitemap = expectedRegionUrls.filter((url) => !sitemapSet.has(url));

  const expectedSet = new Set(allExpectedPublicUrls.map(normalizeUrl));
  const unexpectedSitemapUrls = sitemapUrls.filter((url) => !expectedSet.has(url));

  const blankGiftCardSlugs = verifiedCards.filter((card) => !card.slug.trim());
  const duplicateGiftCardSlugs = duplicateValues(verifiedCards.map((card) => card.slug));
  const duplicateBrandSlugs = duplicateValues(brands.map((brand) => brand.slug));
  const duplicateCategorySlugs = duplicateValues(categories.map((category) => category.slug));
  const duplicateOccasionSlugs = duplicateValues(occasions.map((occasion) => occasion.slug));
  const duplicateSitemapUrls = duplicateValues(sitemapUrls);

  const inactiveMerchantCards = verifiedCards.filter(
    (card) => card.merchant.status !== "ACTIVE",
  );

  const cardsWithoutActiveCategory = verifiedCards.filter(
    (card) => card.categories.length === 0,
  );

  const cardsWithoutActiveOccasion = verifiedCards.filter(
    (card) => card.occasions.length === 0,
  );

  const thinBrands = brands
    .filter((brand) => brand._count.giftCards <= 2)
    .map((brand) => ({
      slug: brand.slug,
      name: brand.name,
      cards: brand._count.giftCards,
    }));

  const thinIndexableCategories = categories
    .filter(
      (category) =>
        categorySlugSet.has(category.slug) &&
        category._count.giftCards <= 2,
    )
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      cards: category._count.giftCards,
    }));

  const thinIndexableOccasions = occasions
    .filter(
      (occasion) =>
        indexableOccasionSlugSet.has(occasion.slug) &&
        occasion._count.giftCards <= 2,
    )
    .map((occasion) => ({
      slug: occasion.slug,
      name: occasion.name,
      cards: occasion._count.giftCards,
    }));

  const thinRegions = regionOptions
    .filter((region) => region.count < 3)
    .map((region) => ({
      slug: region.slug,
      label: region.label,
      cards: region.count,
    }));

  const issues: Issue[] = [];

  const pushIssue = (
    severity: Issue["severity"],
    code: string,
    details: unknown[],
  ) => {
    if (!details.length) return;
    issues.push({ severity, code, count: details.length, details });
  };

  pushIssue("HIGH", "VERIFIED_GIFTCARDS_MISSING_FROM_SITEMAP", missingGiftCardsFromSitemap);
  pushIssue("HIGH", "VERIFIED_CARD_WITH_INACTIVE_MERCHANT", inactiveMerchantCards);
  pushIssue("HIGH", "DUPLICATE_GIFTCARD_SLUG", duplicateGiftCardSlugs);
  pushIssue("HIGH", "DUPLICATE_SITEMAP_URL", duplicateSitemapUrls);
  pushIssue("HIGH", "BLANK_GIFTCARD_SLUG", blankGiftCardSlugs);

  pushIssue("MEDIUM", "BRAND_MISSING_FROM_SITEMAP", missingBrandsFromSitemap);
  pushIssue("MEDIUM", "CATEGORY_MISSING_FROM_SITEMAP", missingCategoriesFromSitemap);
  pushIssue("MEDIUM", "OCCASION_MISSING_FROM_SITEMAP", missingOccasionsFromSitemap);
  pushIssue("MEDIUM", "REGION_MISSING_FROM_SITEMAP", missingRegionsFromSitemap);
  pushIssue("MEDIUM", "UNEXPECTED_SITEMAP_URL", unexpectedSitemapUrls);
  pushIssue("MEDIUM", "DUPLICATE_BRAND_SLUG", duplicateBrandSlugs);
  pushIssue("MEDIUM", "DUPLICATE_CATEGORY_SLUG", duplicateCategorySlugs);
  pushIssue("MEDIUM", "DUPLICATE_OCCASION_SLUG", duplicateOccasionSlugs);

  pushIssue("LOW", "VERIFIED_CARD_WITHOUT_ACTIVE_CATEGORY", cardsWithoutActiveCategory);
  pushIssue("LOW", "VERIFIED_CARD_WITHOUT_ACTIVE_OCCASION", cardsWithoutActiveOccasion);
  pushIssue("LOW", "THIN_INDEXABLE_BRAND_1_OR_2_CARDS", thinBrands);
  pushIssue("LOW", "THIN_INDEXABLE_CATEGORY_1_OR_2_CARDS", thinIndexableCategories);
  pushIssue("LOW", "THIN_INDEXABLE_OCCASION_1_OR_2_CARDS", thinIndexableOccasions);

  const high = issues.filter((issue) => issue.severity === "HIGH");
  const medium = issues.filter((issue) => issue.severity === "MEDIUM");
  const low = issues.filter((issue) => issue.severity === "LOW");

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    baseUrl: base,
    summary: {
      activeCardsTotal,
      activeVerifiedCards: verifiedCards.length,
      activeVerifiedBrands: brands.length,
      activeVerifiedCategories: categories.length,
      activeVerifiedOccasions: occasions.length,
      canonicalRegions: regionOptions.length,
      indexableRegions3Plus: regionOptions.filter((region) => region.count >= 3).length,
      thinRegionsNoindex: thinRegions.length,
      sitemapUrls: sitemapUrls.length,
      highIssues: high.reduce((sum, issue) => sum + (issue.count || 0), 0),
      mediumIssues: medium.reduce((sum, issue) => sum + (issue.count || 0), 0),
      lowIssues: low.reduce((sum, issue) => sum + (issue.count || 0), 0),
    },
    sitemapCoverage: {
      giftCards: {
        expected: expectedGiftCardUrls.length,
        missing: missingGiftCardsFromSitemap.length,
      },
      brands: {
        expected: expectedBrandUrls.length,
        missing: missingBrandsFromSitemap.length,
      },
      categories: {
        expected: expectedCategoryUrls.length,
        missing: missingCategoriesFromSitemap.length,
      },
      occasions: {
        expected: expectedOccasionUrls.length,
        missing: missingOccasionsFromSitemap.length,
      },
      regions: {
        expected: expectedRegionUrls.length,
        missing: missingRegionsFromSitemap.length,
      },
      duplicateUrls: duplicateSitemapUrls,
      unexpectedUrls: unexpectedSitemapUrls,
    },
    catalogIntegrity: {
      blankGiftCardSlugs: blankGiftCardSlugs.map((card) => ({
        id: card.id,
        title: card.title,
      })),
      duplicateGiftCardSlugs,
      inactiveMerchantCards: inactiveMerchantCards.map((card) => ({
        id: card.id,
        title: card.title,
        slug: card.slug,
        merchant: card.merchant.name,
        merchantStatus: card.merchant.status,
      })),
      cardsWithoutActiveCategory: cardsWithoutActiveCategory.map((card) => ({
        id: card.id,
        title: card.title,
        slug: card.slug,
      })),
      cardsWithoutActiveOccasion: cardsWithoutActiveOccasion.map((card) => ({
        id: card.id,
        title: card.title,
        slug: card.slug,
      })),
    },
    landingPages: {
      thinBrands,
      thinIndexableCategories,
      thinIndexableOccasions,
      thinRegionsNoindex: thinRegions,
    },
    sourceRoutes,
    issues,
  };

  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("\n=== PRODUCTION SEO AUDIT v2 ===\n");
  console.table(report.summary);

  console.log("\n=== SITEMAP COVERAGE ===\n");
  console.table({
    giftCards: report.sitemapCoverage.giftCards,
    brands: report.sitemapCoverage.brands,
    categories: report.sitemapCoverage.categories,
    occasions: report.sitemapCoverage.occasions,
    regions: report.sitemapCoverage.regions,
  });

  console.log("\n=== PUBLIC ROUTE SEO FEATURES ===\n");
  console.table(sourceRoutes);

  console.log("\n=== ISSUE SUMMARY ===\n");
  if (!issues.length) {
    console.log("No production SEO integrity issues detected.");
  } else {
    console.table(
      issues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        count: issue.count || 0,
      })),
    );
  }

  console.log("\nReport:", path.relative(ROOT, REPORT));

  if (high.length > 0) {
    console.error(
      `STOP: ${high.reduce((sum, issue) => sum + (issue.count || 0), 0)} HIGH-severity SEO issue(s) detected.`
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    medium.length > 0
      ? "PASS WITH REVIEW: no HIGH-severity SEO issues; review MEDIUM findings."
      : "PASS: no HIGH/MEDIUM production SEO integrity issues detected."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
