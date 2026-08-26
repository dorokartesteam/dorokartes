import fs from "node:fs";

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:cleanup-stale"] =
  "tsx scripts/pipeline/admin/cleanup-stale-discovery.ts";

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("Added npm script: pipeline:cleanup-stale");
