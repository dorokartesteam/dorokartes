import fs from "node:fs";

const target = "scripts/pipeline/admin/safe-bulk-promotion-v1.ts";

if (!fs.existsSync(target)) {
  console.error(`Missing ${target}`);
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");

const before = src;
src = src.replace(/\blastVerified\s*:/g, "lastVerifiedAt:");

if (src === before) {
  console.log("No lastVerified field found. It may already be patched.");
} else {
  fs.writeFileSync(target, src, "utf8");
  console.log("Patched GiftCard field: lastVerified -> lastVerifiedAt");
}

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts ??= {};
pkg.scripts["pipeline:bulk-promote"] =
  "tsx scripts/pipeline/admin/safe-bulk-promotion-v1.ts";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log("pipeline:bulk-promote remains configured.");
