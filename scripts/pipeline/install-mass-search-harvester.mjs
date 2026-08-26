import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:harvest-search"] =
  "tsx scripts/pipeline/admin/harvest-search.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:harvest-search");
