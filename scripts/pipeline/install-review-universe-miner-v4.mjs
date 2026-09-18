import fs from "node:fs";
const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:mine-review-universe-v4"] =
  "tsx scripts/pipeline/discovery/review-universe-miner-v4.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:mine-review-universe-v4");
