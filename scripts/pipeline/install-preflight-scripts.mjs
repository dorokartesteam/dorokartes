import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
pkg.scripts ??= {};

Object.assign(pkg.scripts, {
  "pipeline:preflight": "tsx scripts/pipeline/preflight-diagnostic.ts",
  "pipeline:verify": "tsx scripts/pipeline/verify.ts"
});

fs.writeFileSync("package.json", JSON.stringify(pkg,null,2) + "\n");
console.log("Preflight scripts installed.");
