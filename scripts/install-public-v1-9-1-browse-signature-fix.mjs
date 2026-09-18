import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const payload = path.join(root, "payload");

if (!fs.existsSync(payload)) {
  console.error("Missing payload folder. Extract ZIP into project root.");
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

console.log("Dorokartes Public v1.9.1 browse signature fix installed.");
