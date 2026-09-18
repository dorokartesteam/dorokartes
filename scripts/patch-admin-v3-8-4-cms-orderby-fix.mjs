import fs from "node:fs";

const file = "lib/admin/cms.ts";

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

/*
  Correct schema:
  - verificationEvents -> checkedAt
  - reviewFlags        -> createdAt
*/

s = s.replace(
  /(verificationEvents:\s*\{[\s\S]*?orderBy:\s*\{\s*)createdAt(\s*:\s*"desc"\s*\})/m,
  '$1checkedAt$2'
);

s = s.replace(
  /(reviewFlags:\s*\{[\s\S]*?orderBy:\s*\{\s*)checkedAt(\s*:\s*"desc"\s*\})/m,
  '$1createdAt$2'
);

fs.writeFileSync(file, s, "utf8");

console.log("Patched lib/admin/cms.ts");
console.log("- verificationEvents orderBy checkedAt");
console.log("- reviewFlags orderBy createdAt");
console.log("Next: clear .next and run npm run build");
