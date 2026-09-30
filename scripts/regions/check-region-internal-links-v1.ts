import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const file = path.resolve(process.cwd(), "app", "regions", "page.tsx");
  const source = await fs.readFile(file, "utf8");

  const checks = {
    preservesFilterHref: source.includes("href={regionsHref(entry.slug)}"),
    hasLandingNav: source.includes('aria-label="Σελίδες δωροκαρτών ανά περιοχή"'),
    onlyIndexableRegions: source.includes(".filter((entry) => entry.count >= 3)"),
    hasDynamicLandingHref: source.includes(
      "href={`/regions/${encodeURIComponent(entry.slug)}`}"
    ),
    hasDescriptiveAnchor: source.includes("Δωροκάρτες σε {entry.label}"),
    preservesNearMe: source.includes("<NearMeButton"),
    preservesLocationCards: source.includes("<RegionLocationCard"),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: region internal-link checks failed.");
  }

  console.log("PASS: region internal-link checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
