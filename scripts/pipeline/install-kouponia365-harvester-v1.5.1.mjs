import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:harvest-kouponia365"] =
  "tsx scripts/pipeline/admin/harvest-kouponia365.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");

console.log("Installed Kouponia365 harvester v1.5.1 full replacement");
