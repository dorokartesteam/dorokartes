import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const payload = path.join(root, "payload");
const cssTarget = path.join(root, "app", "public-v2-0.css");
const cssSource = path.join(payload, "app", "v2-4-2-transparent-logo-stage.css");

if (!fs.existsSync(cssTarget)) {
  console.error("Missing app/public-v2-0.css");
  process.exit(1);
}

const start = "/* === DOROKARTES V2.4.2 START === */";
const end = "/* === DOROKARTES V2.4.2 END === */";

let css = fs.readFileSync(cssTarget, "utf8");
const a = css.indexOf(start);
const b = css.indexOf(end);

if (a !== -1 && b !== -1 && b > a) {
  css = css.slice(0, a) + css.slice(b + end.length);
}

css += `\n${start}\n${fs.readFileSync(cssSource, "utf8")}\n${end}\n`;
fs.writeFileSync(cssTarget, css, "utf8");

fs.rmSync(payload, { recursive: true, force: true });

console.log("Dorokartes Public v2.4.2 transparent logo stage installed.");
