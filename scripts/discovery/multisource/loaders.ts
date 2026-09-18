import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { RawDiscovery } from "./types";

function inferSourceType(name: string): RawDiscovery["sourceType"] {
  const lower = name.toLowerCase();

  if (lower.includes("bestprice")) return "AGGREGATOR";
  if (lower.includes("skroutz")) return "AGGREGATOR";
  if (lower.includes("wolt")) return "MARKETPLACE";
  if (lower.includes("baladeur")) return "MARKETPLACE";
  if (lower.includes("google") || lower.includes("search")) return "SEARCH_ENGINE";
  if (lower.includes("official")) return "OFFICIAL";
  return "MANUAL";
}

function inferSourceName(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

export async function loadJsonFile(path: string): Promise<RawDiscovery[]> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`${path}: JSON root must be an array`);
  }

  return parsed as RawDiscovery[];
}

export async function loadCsvFile(path: string): Promise<RawDiscovery[]> {
  const raw = await readFile(path, "utf-8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));

    const filename = path.split(/[\\/]/).pop() ?? "manual";

    return {
      sourceType:
        (row.sourceType as RawDiscovery["sourceType"]) ||
        inferSourceType(filename),
      sourceName: row.sourceName || inferSourceName(filename),
      sourceUrl: row.sourceUrl,
      title: row.title || null,
      merchantName: row.merchantName || null,
      possibleOfficialUrl: row.possibleOfficialUrl || null,
      notes: row.notes || null,
    };
  });
}

export async function loadFolder(folder: string): Promise<RawDiscovery[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const items: RawDiscovery[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const full = join(folder, entry.name);
    const ext = extname(entry.name).toLowerCase();

    try {
      if (ext === ".json") {
        items.push(...(await loadJsonFile(full)));
      } else if (ext === ".csv") {
        items.push(...(await loadCsvFile(full)));
      }
    } catch (error) {
      console.warn(`Skipping ${entry.name}: ${String(error)}`);
    }
  }

  return items.filter((item) => item.sourceUrl);
}
