import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:audit-duplicates"] =
  "tsx scripts/pipeline/admin/audit-duplicates-v1.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");

console.log("Installed pipeline:audit-duplicates");
