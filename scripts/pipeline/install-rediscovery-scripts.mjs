import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts ??= {};

Object.assign(pkg.scripts, {
  "pipeline:rediscover": "tsx scripts/pipeline/rediscover.ts",
  "pipeline:rediscovery-reconcile": "tsx scripts/pipeline/rediscovery-reconcile.ts"
});

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Automatic rediscovery scripts installed.");
