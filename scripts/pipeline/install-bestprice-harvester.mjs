import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:harvest-bestprice"] =
  "tsx scripts/pipeline/admin/harvest-bestprice.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");

console.log("Installed/updated pipeline:harvest-bestprice (v2 browser harvester)");
