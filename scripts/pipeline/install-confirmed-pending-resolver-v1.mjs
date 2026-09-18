import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:resolve-confirmed-pending"] =
  "tsx scripts/pipeline/admin/resolve-confirmed-pending-v1.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:resolve-confirmed-pending");
