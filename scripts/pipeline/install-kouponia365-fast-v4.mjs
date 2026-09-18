import fs from "node:fs";
const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:resolve-kouponia365-fast-v4"] =
  "tsx scripts/pipeline/admin/resolve-kouponia365-fast-v4.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:resolve-kouponia365-fast-v4");
