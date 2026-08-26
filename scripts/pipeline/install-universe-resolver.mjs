import fs from "node:fs";
import path from "node:path";

const packagePath = path.join(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:resolve-universe"] =
  "tsx scripts/pipeline/admin/resolve-universe.ts";
pkg.scripts["pipeline:build-scan-ready"] =
  "tsx scripts/pipeline/admin/build-scan-ready.ts";

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
console.log("Installed:");
console.log("- pipeline:resolve-universe");
console.log("- pipeline:build-scan-ready");
