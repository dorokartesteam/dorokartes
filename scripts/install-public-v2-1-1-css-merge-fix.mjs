import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "payload", "app", "v2-1-1-merge.css");
const target = path.join(root, "app", "public-v2-0.css");

if (!fs.existsSync(target)) {
  console.error("Missing app/public-v2-0.css");
  process.exit(1);
}

if (!fs.existsSync(source)) {
  console.error("Missing v2-1-1 merge CSS.");
  process.exit(1);
}

const markerStart = "/* === DOROKARTES V2.1.1 MERGED FIX START === */";
const markerEnd = "/* === DOROKARTES V2.1.1 MERGED FIX END === */";

let current = fs.readFileSync(target, "utf8");
const incoming = fs.readFileSync(source, "utf8");

const start = current.indexOf(markerStart);
const end = current.indexOf(markerEnd);

if (start !== -1 && end !== -1 && end > start) {
  current = current.slice(0, start) + current.slice(end + markerEnd.length);
}

current += `\n\n${markerStart}\n${incoming}\n${markerEnd}\n`;
fs.writeFileSync(target, current, "utf8");

// Remove the now-unnecessary public-v2-1 import so we rely on one already-working CSS file.
const layout = path.join(root, "app", "layout.tsx");
if (fs.existsSync(layout)) {
  let s = fs.readFileSync(layout, "utf8");
  s = s.replace(/import\s+["']\.\/public-v2-1\.css["'];?/g, "");
  fs.writeFileSync(layout, s, "utf8");
}

// Clean patch payload.
fs.rmSync(path.join(root, "payload"), { recursive: true, force: true });

console.log("Merged v2.1 card/category styles directly into app/public-v2-0.css.");
console.log("No extra CSS import is required now.");
