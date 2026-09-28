import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const limit = Number(process.argv[2] || 200);
  const p = path.resolve(process.cwd(), "reports", "regions", "merchant-location-discovery-v3-quality-v2.json");
  const report = JSON.parse(await fs.readFile(p, "utf8"));

  console.log(`=== QUALITY v2 FINAL SAFE — TOP ${limit} ===`);
  for (const r of (report.finalSafe || []).slice(0, limit)) {
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
