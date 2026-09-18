import fs from "node:fs";

const pkgPath = "package.json";
const backupPath = "package.pre-unified.json";

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(pkgPath, backupPath);
  console.log(`Backup created: ${backupPath}`);
}

const keep = {};
for (const key of [
  "dev",
  "build",
  "start",
  "lint",
  "db:seed",
]) {
  if (pkg.scripts?.[key]) keep[key] = pkg.scripts[key];
}

Object.assign(keep, {
  "pipeline:discover": "tsx scripts/pipeline/commands/discover.ts",
  "pipeline:verify": "tsx scripts/pipeline/commands/verify.ts",
  "pipeline:rediscover": "tsx scripts/pipeline/commands/rediscover.ts",
  "pipeline:canonicalize": "tsx scripts/pipeline/commands/canonicalize.ts",
  "pipeline:promote": "tsx scripts/pipeline/commands/promote.ts",
  "pipeline:reverify": "tsx scripts/pipeline/commands/reverify.ts",
  "pipeline:review": "tsx scripts/pipeline/commands/review.ts",
  "pipeline:validate": "tsx scripts/pipeline/commands/validate.ts",
  "pipeline:test": "tsx tests/pipeline/unified-regression.ts",

  // Administrative / diagnostic tools remain available but are explicitly non-core.
  "pipeline:governance": "tsx scripts/pipeline/admin/seed-governance.ts",
  "pipeline:rediscovery-reconcile": "tsx scripts/pipeline/admin/rediscovery-reconcile.ts",
  "pipeline:verification-overrides": "tsx scripts/pipeline/admin/seed-verification-overrides.ts",
  "pipeline:diag:llm": "tsx scripts/pipeline/diagnostics/diagnose-llm.ts",
  "pipeline:diag:content": "tsx scripts/pipeline/diagnostics/diagnose-content.ts",
  "pipeline:diag:preflight": "tsx scripts/pipeline/diagnostics/preflight.ts"
});

pkg.scripts = keep;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log("Unified pipeline npm scripts installed.");
console.log("Legacy source files were NOT deleted; they are simply inactive.");
