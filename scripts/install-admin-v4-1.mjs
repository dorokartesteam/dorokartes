import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const payload = path.join(root, "payload");
if (!fs.existsSync(payload)) { console.error("Missing payload folder. Extract ZIP into project root first."); process.exit(1); }

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (!s.endsWith("verification-function.txt")) fs.copyFileSync(s, d);
  }
}

// Patch verification query function before copying the rest.
const dataFile = path.join(root, "lib/admin/data.ts");
const replacementFile = path.join(payload, "lib/admin/verification-function.txt");
if (fs.existsSync(dataFile) && fs.existsSync(replacementFile)) {
  let src = fs.readFileSync(dataFile, "utf8");
  const replacement = fs.readFileSync(replacementFile, "utf8");
  const start = src.indexOf("export async function getVerificationData() {");
  const end = src.indexOf("\nexport async function getTaxonomyData()", start);
  if (start < 0 || end < 0) { console.error("Could not locate getVerificationData() in lib/admin/data.ts"); process.exit(1); }
  src = src.slice(0, start) + replacement + "\n" + src.slice(end + 1);
  fs.writeFileSync(dataFile, src, "utf8");
}

copyDir(payload, root);

// Ensure v4.1 CSS loads after the current admin styles.
const layoutFile = path.join(root, "app/admin/layout.tsx");
if (fs.existsSync(layoutFile)) {
  let layout = fs.readFileSync(layoutFile, "utf8");
  const line = 'import "@/app/admin/v4-1-extra.css";';
  if (!layout.includes(line)) {
    const imports = [...layout.matchAll(/^import .*;$/gm)];
    const last = imports.at(-1);
    if (last?.index !== undefined) {
      const pos = last.index + last[0].length;
      layout = layout.slice(0, pos) + "\n" + line + layout.slice(pos);
    } else layout = line + "\n" + layout;
    fs.writeFileSync(layoutFile, layout, "utf8");
  }
}

fs.rmSync(payload, { recursive: true, force: true });
console.log("Dorokartes Admin v4.1 installed.");
console.log("Gift Card detail, Merchant detail and Verification workflow upgraded.");
