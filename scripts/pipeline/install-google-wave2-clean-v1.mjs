import fs from "node:fs";

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:clean-google-wave2"] =
  "tsx scripts/pipeline/admin/clean-google-wave2-v1.ts";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed pipeline:clean-google-wave2");
