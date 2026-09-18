import fs from "node:fs";

const packagePath = "package.json";
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:harvest-kouponia365"] =
  "tsx scripts/pipeline/admin/harvest-kouponia365.ts";

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

console.log("Installed Kouponia365 harvester v1.3");
