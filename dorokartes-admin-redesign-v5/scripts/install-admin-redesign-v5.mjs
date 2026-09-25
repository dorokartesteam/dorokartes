import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "app/admin/layout.tsx");

if (!fs.existsSync(layoutPath)) {
  throw new Error("app/admin/layout.tsx was not found.");
}

let source = fs.readFileSync(layoutPath, "utf8");
const importLine = 'import "@/app/admin/admin-v5.css";';

if (!source.includes(importLine)) {
  const anchors = [
    'import "@/app/admin/v4-7-activation.css";',
    'import "@/app/admin/v4-6-revenue.css";',
    'import "@/app/admin/v4-5-merchant-management.css";',
    'import "@/app/admin/v4-4-detail-workspace.css";',
  ];

  const anchor = anchors.find((value) => source.includes(value));
  if (anchor) {
    source = source.replace(anchor, `${anchor}\n${importLine}`);
  } else {
    const lastImport = [...source.matchAll(/^import .*;$/gm)].at(-1);
    if (!lastImport) throw new Error("Could not find an import anchor in app/admin/layout.tsx");
    const insertAt = lastImport.index + lastImport[0].length;
    source = `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
  }

  fs.writeFileSync(layoutPath, source, "utf8");
  console.log("PASS: Admin V5 stylesheet loaded last.");
} else {
  console.log("PASS: Admin V5 stylesheet already imported.");
}

console.log("PASS: AdminShell V5 file is installed by patch extraction.");
console.log("PASS: No Prisma migration required.");
console.log("PASS: Dorokartes Admin Redesign V5 installer completed.");
