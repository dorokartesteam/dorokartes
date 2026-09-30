import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const page = await fs.readFile(
    path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx"),
    "utf8"
  );
  const content = await fs.readFile(
    path.resolve(process.cwd(), "lib", "regions", "region-landing-content.ts"),
    "utf8"
  );

  const checks = {
    importsContentHelper: page.includes("getRegionLandingContent"),
    loadsBySlug: page.includes("getRegionLandingContent(region.slug)"),
    rendersCustomIntro: page.includes("{landingContent.intro}"),
    rendersSupportingCopy: page.includes("{landingContent.supporting}"),
    preservesFallback: page.includes("Ανακάλυψε δωροκάρτες από επιχειρήσεις"),
    athensContent: content.includes('"αθηνα"'),
    thessalonikiContent: content.includes('"θεσσαλονικη"'),
    piraeusContent: content.includes('"πειραιασ"'),
    tenRegionEntries: (content.match(/^  "[^"]+": \{/gm) || []).length === 10,
    preservesPagination: page.includes("<PublicPagination"),
    preservesJsonLd: page.includes('"@type": "CollectionPage"'),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: region content checks failed.");
  }

  console.log("PASS: region content checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
