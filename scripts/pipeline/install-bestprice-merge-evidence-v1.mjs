import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:merge-bestprice-evidence"] =
  "tsx scripts/pipeline/admin/merge-bestprice-evidence.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:merge-bestprice-evidence");
