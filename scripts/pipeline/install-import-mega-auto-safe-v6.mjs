import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:import-mega-auto-safe-v6"] =
  "tsx scripts/pipeline/discovery/import-mega-auto-safe-v6.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:import-mega-auto-safe-v6");
