import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:dedupe-bestprice-issuers"] =
  "tsx scripts/pipeline/admin/dedupe-bestprice-issuers.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:dedupe-bestprice-issuers");
