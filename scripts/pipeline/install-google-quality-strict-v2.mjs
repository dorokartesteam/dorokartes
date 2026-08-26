import fs from "node:fs";
const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:quality-google-strict"] =
  "tsx scripts/pipeline/admin/google-quality-strict-v2.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:quality-google-strict");
