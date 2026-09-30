import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const page = await fs.readFile(
    path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx"),
    "utf8"
  );

  const sitemap = await fs.readFile(
    path.resolve(process.cwd(), "app", "sitemap.ts"),
    "utf8"
  );

  const checks = {
    dynamicRegionRoute: page.includes("export default async function RegionPage"),
    regionMetadata: page.includes("generateMetadata"),
    canonicalPresent: page.includes("canonical: `/regions/"),
    thinPagesNoindex: page.includes("region.count >= 3"),
    usesGiftCardIds: page.includes("getGiftCardIdsForRegion"),
    usesPublicCardSelect: page.includes("publicCardSelect"),
    rendersGiftCardCard: page.includes("<GiftCardCard"),
    sitemapUsesRegionOptions: sitemap.includes("getRegionOptions"),
    sitemapThreshold: sitemap.includes(".filter((region) => region.count >= 3)"),
    sitemapRegionUrls: sitemap.includes("/regions/${encodeURIComponent(region.slug)}"),
  };

  console.table(checks);

  if (Object.values(checks).some((v) => !v)) {
    throw new Error("STOP: region page / sitemap static checks failed.");
  }

  console.log("PASS: region page + sitemap static checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
