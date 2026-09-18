import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:import-review-universe-v4.1"] =
  "tsx scripts/pipeline/import/import-review-universe-v4-1.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");

console.log("Installed pipeline:import-review-universe-v4.1");
