import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:extract-bestprice-issuers-v4"] =
  "tsx scripts/pipeline/admin/extract-bestprice-issuers-v4.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:extract-bestprice-issuers-v4");
