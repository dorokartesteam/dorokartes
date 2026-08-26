import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";

const ROOT = process.cwd();
const INPUT =
  process.env.UNIVERSE_RESOLVED_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe-resolved.csv");
const MASTER =
  process.env.UNIVERSE_MASTER_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe-master.csv");
const OUTPUT =
  process.env.UNIVERSE_SCAN_READY_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe.csv");

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

function readRows(file: string) {
  const matrix = parseCsv(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const headers = matrix.shift() ?? [];
  return matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h.trim()] = cells[i] ?? ""));
    return row;
  });
}

function esc(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function regDomain(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function main() {
  const source = fs.existsSync(INPUT) ? INPUT : MASTER;
  const rows = readRows(source);

  const seen = new Set<string>();
  const out: Array<{ merchant_name: string; website_url: string; category: string }> = [];
  let duplicates = 0;
  let excludedMarket = 0;

  for (const row of rows) {
    const url = row.website_url?.trim();
    if (!url) continue;

    const status = row.domain_status?.trim();
    if (status && status !== "SCAN_READY") {
      excludedMarket++;
      continue;
    }

    const domain = regDomain(url);
    if (!domain) continue;

    if (seen.has(domain)) {
      duplicates++;
      continue;
    }

    seen.add(domain);
    out.push({
      merchant_name: row.merchant_name,
      website_url: url,
      category: row.category || "other",
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const lines = [
    "merchant_name,website_url,category",
    ...out.map((r) => [r.merchant_name, r.website_url, r.category].map(esc).join(",")),
  ];

  fs.writeFileSync(OUTPUT, "\uFEFF" + lines.join("\n") + "\n", "utf8");

  console.log("Dorokartes Scan-Ready Builder");
  console.log("=============================");
  console.log(`Input: ${source}`);
  console.log(`Rows read: ${rows.length}`);
  console.log(`Unique scan-ready domains: ${out.length}`);
  console.log(`Duplicate domains removed: ${duplicates}`);
  console.log(`Non-scan-ready/market-review excluded: ${excludedMarket}`);
  console.log(`Output: ${OUTPUT}`);
  console.log("");
  console.log("Now run: npm run pipeline:discover -- --limit=45 --apply");
}

main();
