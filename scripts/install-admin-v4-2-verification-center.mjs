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

for (const patch of [
  "app/admin/patch-layout-v42.mjs",
  "lib/admin/patch-verification-data-v42.mjs",
]) {
  const r = spawnSync(process.execPath, [patch], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
  fs.rmSync(path.join(root, patch), { force: true });
}

fs.rmSync(payload, { recursive: true, force: true });

console.log("Dorokartes Admin v4.2 Verification Center installed.");
console.log("No schema migration required.");
