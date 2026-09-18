import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:import-auto-safe-v5.5"] =
  "tsx scripts/pipeline/discovery/import-auto-safe-v5.5.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:import-auto-safe-v5.5");
