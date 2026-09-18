import fs from "node:fs";

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts ??= {};
pkg.scripts["pipeline:queue-reconcile"] =
  "tsx scripts/pipeline/admin/queue-reconcile.ts";

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("Added pipeline:queue-reconcile");
