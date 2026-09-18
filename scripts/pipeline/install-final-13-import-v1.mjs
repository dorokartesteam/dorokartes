import fs from "node:fs";
const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:final-13-import"] =
  "tsx scripts/pipeline/import/final-13-import-v1.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:final-13-import");
