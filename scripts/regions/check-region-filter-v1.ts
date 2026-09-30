import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const {
    getRegionOptions,
    getGiftCardIdsForRegion,
  } = await import("../../lib/regions/region-assignment");

  const regions = await getRegionOptions();

  console.log("=== FINAL REGION FILTER CHECK ===");
  console.log("Unique regions:", regions.length);
  console.table(regions);

  for (const slug of ["αθηνα", "θεσσαλονικη", "πειραιασ", "ηλιουπολη", "αιγαλεω"]) {
    const ids = await getGiftCardIdsForRegion(slug);
    console.log(`${slug}: ${ids.length} cards`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
