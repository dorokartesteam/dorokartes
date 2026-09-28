import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const limit = Number(process.argv[2] || 250);
  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-production-gate-v1.json"
  );
  const report = JSON.parse(await fs.readFile(p, "utf8"));

  console.log(`=== PRODUCTION GATE v1 — SAFE TOP ${limit} ===`);
  for (const r of (report.productionSafe || []).slice(0, limit)) {
    console.log(`\n### ${r.merchant}`);
    console.log(`${r.sourceType} | ${r.city || "-"} | ${r.addressLine}`);
    console.log(r.sourceUrl);
  }
  console.log("\nREAD ONLY.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
