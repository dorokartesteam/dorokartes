import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts ??= {};

Object.assign(pkg.scripts, {
  "pipeline:search-import": "tsx scripts/pipeline/search-assisted-import.ts",
  "pipeline:search-review": "tsx scripts/pipeline/search-assisted-review.ts",
  "pipeline:source-backed-review": "tsx scripts/pipeline/source-backed-review.ts"
});

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Search-assisted discovery scripts installed.");
