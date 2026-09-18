
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
pkg.scripts ??= {};
Object.assign(pkg.scripts, {
  "pipeline:verify": "tsx scripts/pipeline/verify.ts",
  "pipeline:rediscovery-summary": "tsx scripts/pipeline/rediscovery-summary.ts",
  "pipeline:verification-overrides": "tsx scripts/pipeline/seed-verification-overrides.ts"
});
fs.writeFileSync("package.json", JSON.stringify(pkg,null,2)+"\n");
console.log("Verification hardening scripts installed.");
