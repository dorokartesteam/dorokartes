import fs from "node:fs";

const files = [
  "lib/admin/data.ts",
  "app/api/admin/discovery/[id]/route.ts",
  "app/api/admin/gift-card/[id]/route.ts",
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    process.exitCode = 1;
    continue;
  }

  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(
    'import prisma from "@/lib/prisma";',
    'import { prisma } from "@/lib/prisma";'
  );

  if (before === after) {
    console.log(`No change needed: ${file}`);
  } else {
    fs.writeFileSync(file, after, "utf8");
    console.log(`Patched: ${file}`);
  }
}

console.log("");
console.log("Done. Run: npm run build");
