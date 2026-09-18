import fs from "node:fs";

const file = "lib/admin/readiness.ts";
if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

// Fix implicit-any callbacks created because Prisma delegate is intentionally typed as any.
s = s.replace(/items\.filter\(\(x\) =>/g, 'items.filter((x: ReadinessItem) =>');

fs.writeFileSync(file, s, "utf8");

console.log("Patched lib/admin/readiness.ts implicit-any callbacks.");
console.log("Next: npm run build");
