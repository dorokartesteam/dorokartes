import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts ??= {};

Object.assign(pkg.scripts, {
  "pipeline:governance": "tsx scripts/pipeline/seed-governance.ts",
  "pipeline:verify": "tsx scripts/pipeline/verify.ts",
  "pipeline:verify-summary": "tsx scripts/pipeline/verification-summary.ts",
  "pipeline:validate": "tsx scripts/pipeline/validate-production.ts",
  "pipeline:test": "tsx tests/pipeline/regression.ts"
});

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Stable pipeline scripts installed.");
