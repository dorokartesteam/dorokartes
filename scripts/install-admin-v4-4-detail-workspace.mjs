import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const payload = path.join(root, "payload");

if (!fs.existsSync(payload)) {
  console.error("Missing payload folder. Extract ZIP into project root first.");
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

const patchFile = "app/admin/patch-layout-v44.mjs";
const r = spawnSync(process.execPath, [patchFile], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

fs.rmSync(path.join(root, patchFile), { force: true });
fs.rmSync(payload, { recursive: true, force: true });

console.log("Dorokartes Admin v4.4 Detail Workspace installed.");
console.log("No database/schema changes.");
