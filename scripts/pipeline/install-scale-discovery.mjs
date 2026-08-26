import fs from "node:fs";

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:discover"] =
  "tsx scripts/pipeline/commands/discover.ts";
pkg.scripts["pipeline:discover-summary"] =
  "tsx scripts/pipeline/admin/discovery-scale-summary.ts";

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");

console.log("Scale discovery v3 installed.");
console.log("Stable pipeline:discover now uses official homepage+sitemap evidence only.");
