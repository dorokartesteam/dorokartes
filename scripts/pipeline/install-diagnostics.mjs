import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
pkg.scripts ??= {};

Object.assign(pkg.scripts, {
  "pipeline:verify": "tsx scripts/pipeline/verify.ts",
  "pipeline:diagnose-llm": "tsx scripts/pipeline/diagnose-llm.ts",
  "pipeline:diagnose-content": "tsx scripts/pipeline/diagnose-content.ts"
});

fs.writeFileSync("package.json", JSON.stringify(pkg,null,2) + "\n");
console.log("Verification diagnostic scripts installed.");
