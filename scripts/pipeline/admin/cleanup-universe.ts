import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MASS = path.join(ROOT, "data", "discovery", "mass");
const CLEAN = path.join(MASS, "merchant-universe-master-clean.csv");
const MASTER = path.join(MASS, "merchant-universe-master.csv");
const STATE = path.join(MASS, "merchant-universe-resolution.jsonl");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim()));
}

function cleanNames() {
  const raw = fs.readFileSync(CLEAN, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];
  const nameIndex = headers.findIndex((x) => x.trim() === "merchant_name");
  return new Set(
    matrix
      .map((r) => (r[nameIndex] ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function backup(file: string) {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(file, `${file}.backup-${stamp}`);
}

function main() {
  if (!fs.existsSync(CLEAN)) {
    throw new Error(`Missing clean universe: ${CLEAN}`);
  }

  const names = cleanNames();

  backup(MASTER);
  backup(STATE);

  fs.copyFileSync(CLEAN, MASTER);

  let kept = 0;
  let dropped = 0;

  if (fs.existsSync(STATE)) {
    const output: string[] = [];

    for (const line of fs.readFileSync(STATE, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;

      try {
        const item = JSON.parse(line);
        const key = String(item.merchantName ?? "").trim().toLowerCase();

        if (names.has(key)) {
          output.push(JSON.stringify(item));
          kept++;
        } else {
          dropped++;
        }
      } catch {
        dropped++;
      }
    }

    fs.writeFileSync(STATE, output.length ? output.join("\n") + "\n" : "", "utf8");
  }

  console.log("Dorokartes Universe Cleanup v1");
  console.log("==============================");
  console.log(`Clean master merchants: ${names.size}`);
  console.log(`Resolution records preserved: ${kept}`);
  console.log(`Bad/stale resolution records removed: ${dropped}`);
  console.log("");
  console.log("Backups were created beside the original files.");
  console.log("Next:");
  console.log("  npm run pipeline:resolve-universe -- --limit=25");
  console.log("  npm run pipeline:resolve-universe -- --limit=25 --apply");
}

main();
