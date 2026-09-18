import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:import-focused-auto-safe-v7"] =
  "tsx scripts/pipeline/discovery/import-focused-auto-safe-v7.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:import-focused-auto-safe-v7");
