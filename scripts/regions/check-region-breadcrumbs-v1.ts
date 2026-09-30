import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const file = path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx");
  const source = await fs.readFile(file, "utf8");

  const checks = {
    hasBreadcrumbList: source.includes('"@type": "BreadcrumbList"'),
    hasThreeLevels:
      source.includes('position: 1') &&
      source.includes('position: 2') &&
      source.includes('position: 3'),
    linksHome: source.includes('name: "Αρχική"'),
    linksRegions: source.includes('name: "Περιοχές"'),
    linksCurrentRegion: source.includes('name: region.label'),
    preservesCollectionPage: source.includes('"@type": "CollectionPage"'),
    preservesItemList: source.includes('"@type": "ItemList"'),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: breadcrumb JSON-LD checks failed.");
  }

  console.log("PASS: breadcrumb JSON-LD checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
