import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const p = path.resolve(process.cwd(), "app", "regions", "page.tsx");
  const s = await fs.readFile(p, "utf8");

  const checks = {
    importsRegionHelpers: s.includes("getRegionOptions, regionLabelFromLocation, regionSlug"),
    acceptsRegionParam: s.includes("region?: string"),
    noSelectedCity: !s.includes("selectedCity"),
    noCityQueryInput: !s.includes('name="city"'),
    usesRegionOptions: s.includes("regionOptions.map"),
    filtersByCanonicalSlug: s.includes("regionSlug(label) !== selectedRegionSlug"),
    preservesNearMe: s.includes("<NearMeButton"),
    preservesLocationCards: s.includes("<RegionLocationCard"),
  };

  console.table(checks);

  if (Object.values(checks).some((v) => !v)) {
    throw new Error("STOP: one or more region UI checks failed.");
  }

  console.log("PASS: static region UI checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
