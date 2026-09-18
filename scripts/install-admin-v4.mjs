import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const payloadCandidates = [
  path.join(root, "payload"),
  path.join(root, "__dorokartes_admin_v4_payload")
];
const payload = payloadCandidates.find((p) => fs.existsSync(p));

if (!payload) {
  console.error("Missing payload folder. Extract the patch ZIP into the Dorokartes project root first.");
  process.exit(1);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(payload, root);
fs.rmSync(payload, { recursive: true, force: true });

console.log("Dorokartes Admin v4 installed.");
console.log("Replaced: AdminShell, Analytics, Duplicate Center, SEO Center, Admin layout.");
console.log("Added: app/admin/admin-final.css");
