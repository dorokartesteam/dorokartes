import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:manual-three-pack"] =
  "tsx scripts/pipeline/admin/manual-three-pack-v1.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:manual-three-pack");
