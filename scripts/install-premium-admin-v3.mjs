import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "dorokartes-premium-admin-v3-payload");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(root, `backup-admin-before-v3-${stamp}`);

if (!fs.existsSync(src)) {
  console.error("Missing dorokartes-premium-admin-v3-payload folder. Extract the ZIP at project root first.");
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else {
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(a, b);
    }
  }
}

const currentAdmin = path.join(root, "app", "admin");
if (fs.existsSync(currentAdmin)) {
  copyDir(currentAdmin, path.join(backup, "app", "admin"));
  console.log(`Backed up current app/admin -> ${backup}`);
}

copyDir(src, root);

console.log("");
console.log("Premium Admin v3 installed.");
console.log("Routes:");
console.log("  /admin");
console.log("  /admin/merchants");
console.log("  /admin/gift-cards");
console.log("  /admin/discovery");
console.log("  /admin/verification");
console.log("  /admin/taxonomy");
console.log("  /admin/quality");
console.log("  /admin/analytics");
console.log("  /admin/pipeline");
console.log("  /admin/duplicates");
console.log("  /admin/homepage");
console.log("  /admin/seo");
console.log("  /admin/settings");
console.log("");
console.log("Next: npm run build");
