import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const limit = Number(process.argv[2] || 150);
  const p = path.resolve(process.cwd(), "reports", "regions", "merchant-location-discovery-v3-quality-v1.json");
  const report = JSON.parse(await fs.readFile(p, "utf8"));
  const rows = [...(report.strictSafe || [])].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

  console.log(`=== STRICT QUALITY v1 — SAFE TOP ${limit} ===`);
  for (const r of rows.slice(0, limit)) {
    console.log(`\n### ${r.merchant}`);
    console.log(`${r.sourceType} | q=${r.qualityScore} | ${r.city || "-"} | ${r.addressLine}`);
    console.log(r.sourceUrl);
    console.log(`reasons: ${(r.qualityReasons || []).join("; ")}`);
  }
  console.log("\nREAD ONLY.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
