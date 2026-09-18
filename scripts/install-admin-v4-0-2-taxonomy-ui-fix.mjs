import fs from "node:fs";
import path from "node:path";

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
    else {
      if (d.endsWith(path.join("app", "admin", "admin-final.css")) && fs.existsSync(d)) {
        const patch = fs.readFileSync(s, "utf8");
        fs.appendFileSync(d, "\n" + patch + "\n");
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }
}

copyDir(payload, root);
fs.rmSync(payload, { recursive: true, force: true });

console.log("Admin v4.0.2 taxonomy UI fix installed.");
