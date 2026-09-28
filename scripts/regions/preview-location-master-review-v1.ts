import fs from "node:fs/promises";
import path from "node:path";

const p = path.resolve(
  process.cwd(),
  "reports",
  "regions",
  "merchant-location-master-pass-v1.json",
);

const report = JSON.parse(await fs.readFile(p, "utf8"));
console.log("=== MASTER PASS SUMMARY ===");
console.table(report.summary);

console.log("\n=== REVIEW — FIRST 150 ===");
for (const row of (report.review || []).slice(0, 150)) {
  console.log(`\n### ${row.merchant}`);
  console.log(`${row.sourceType || "-"} | ${row.city || "-"} | ${row.addressLine || "-"}`);
  console.log(row.sourceUrl || "-");
  console.log(`reasons: ${(row.reasons || []).join("; ")}`);
}
