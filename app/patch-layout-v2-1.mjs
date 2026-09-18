import fs from "node:fs";

const file = "app/layout.tsx";
if (!fs.existsSync(file)) {
  console.error("Missing app/layout.tsx");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
s = s.replace(/import\s+["']\.\/public-v2-1\.css["'];?/g, "");

const marker = 'import "./public-v2-1.css";';
const idx = s.lastIndexOf("import ");

if (idx >= 0) {
  const semi = s.indexOf(";", idx);
  s = s.slice(0, semi + 1) + "\n" + marker + s.slice(semi + 1);
} else {
  s = marker + "\n" + s;
}

fs.writeFileSync(file, s, "utf8");
console.log("Added public-v2-1.css import.");
