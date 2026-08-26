import fs from "node:fs";
const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:clean-google-harvest"] =
  "tsx scripts/pipeline/admin/clean-google-harvest.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:clean-google-harvest");
