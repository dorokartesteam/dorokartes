import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const file = path.resolve(process.cwd(), "lib", "regions", "region-landing-content.ts");
  const source = await fs.readFile(file, "utf8");

  const required = [
    "αθηνα",
    "θεσσαλονικη",
    "πειραιασ",
    "ηρακλειο",
    "χανια",
    "περιστερι",
    "μαρουσι",
    "ροδοσ",
    "ιωαννινα",
    "λαρισα",
    "σερρεσ",
    "χαλανδρι",
    "μυκονοσ",
    "αλεξανδρουπολη",
    "γλυφαδα",
    "νεα-ιωνια",
    "σαντορινη",
    "βολοσ",
    "καλαματα",
    "κηφισια",
    "κορωπι",
    "νεα-σμυρνη",
    "πατρα",
  ];

  const checks = {
    all23Present: required.every((slug) => source.includes(`"${slug}": {`)),
    exactly23Entries: (source.match(/^  "[^"]+": \{/gm) || []).length === 23,
    helperPreserved: source.includes("getRegionLandingContent"),
    exportedSlugsPreserved: source.includes("REGION_CONTENT_SLUGS"),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: region content v2 checks failed.");
  }

  console.log("PASS: region content v2 checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
