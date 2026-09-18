import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:safe-dedupe"] =
  "tsx scripts/pipeline/admin/safe-dedupe-cleanup-v3.1.ts";
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Updated pipeline:safe-dedupe -> v3.1");
