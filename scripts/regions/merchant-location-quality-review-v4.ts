import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Decision = "SAFE" | "REVIEW" | "REJECT";

type Row = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  sourceUrl: string | null;
  city: string | null;
  normalizedCity?: string | null;
  area: string | null;
  administrativeArea: string | null;
  normalizedAdministrativeArea?: string | null;
  addressLine: string | null;
  postalCode: string | null;
  sourceExcerpt: string | null;
  reviewDecision: Decision;
  reasons?: string[];
};

function norm(v?: string | null) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function postals(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b(\d{3})\s?(\d{2})\b/g)].map(m => `${m[1]}${m[2]}`)
  )];
}

function streetNumbers(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b\d{1,4}(?:-\d{1,4})?\b/g)].map(m => m[0])
      .filter(n => n.length <= 9)
  )];
}

function city(row: Row) {
  return row.normalizedCity || row.city || "";
}

function sameMerchantCity(a: Row, b: Row) {
  return a.merchantId === b.merchantId && norm(city(a)) === norm(city(b));
}

function tokenSet(v?: string | null) {
  const stop = new Set([
    "address","contact","phone","telephone","email","greece","athens","thessaloniki",
    "chania","piraeus","mykonos","santorini","street","str","road","avenue",
    "shop","store","stores","location","opening","hours","zip","show","map"
  ]);

  return new Set(
    norm(v)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(x => x.length >= 3 && !stop.has(x) && !/^\d+$/.test(x))
  );
}

function similarity(a?: string | null, b?: string | null) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  const intersection = [...A].filter(x => B.has(x)).length;
  return intersection / Math.min(A.size, B.size);
}

function duplicate(a: Row, b: Row) {
  if (!sameMerchantCity(a, b)) return false;

  const pa = postals(a.addressLine);
  const pb = postals(b.addressLine);
  const sharedPostal = pa.some(x => pb.includes(x));

  const na = streetNumbers(a.addressLine);
  const nb = streetNumbers(b.addressLine);
  const sharedNumber = na.some(x => nb.includes(x));

  const sim = similarity(a.addressLine, b.addressLine);

  return (
    (sharedPostal && sharedNumber) ||
    (sharedPostal && sim >= 0.25) ||
    (sharedNumber && sim >= 0.45)
  );
}

function multipleAddressesInOneRow(row: Row) {
  const text = norm(row.addressLine);
  const pcs = postals(row.addressLine);

  if (pcs.length >= 2) return true;

  const addressKeywords = (text.match(/\b(address|street|str|avenue|road|διευθυνση)\b/g) || []).length;
  if (addressKeywords >= 2 && streetNumbers(row.addressLine).length >= 2) return true;

  // Two distinct Greek-style postal codes embedded without spacing normalization.
  const raw = row.addressLine || "";
  const rawPc = [...raw.matchAll(/\b\d{3}\s?\d{2}\b/g)].map(x => x[0].replace(/\s+/g, ""));
  if (new Set(rawPc).size >= 2) return true;

  // Known structure: two street-name/number pairs in the same row, even with same postal code.
  const nums = streetNumbers(row.addressLine);
  if (nums.length >= 3 && text.length > 120) return true;

  return false;
}

function cleanerScore(row: Row) {
  let score = 0;
  const url = norm(row.sourceUrl);

  if (/contact|store|stores|location|katast|epikoin/.test(url)) score += 8;
  if (postals(row.addressLine).length === 1) score += 4;
  if (streetNumbers(row.addressLine).length >= 1) score += 3;

  const text = norm(row.addressLine);
  if (text.includes("contact")) score += 1;
  if (text.includes("close skip to content")) score -= 4;
  if (text.includes("terms of use") || text.includes("returns policy")) score -= 10;

  score -= Math.max(0, ((row.addressLine || "").length - 140) / 40);

  return score;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v3.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const sourceSafe = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows: Row[] = sourceSafe.map(r => ({
    ...r,
    reviewDecision: "SAFE",
    reasons: [],
  }));

  // First: reject/review rows that themselves contain multiple locations.
  for (const row of rows) {
    if (multipleAddressesInOneRow(row)) {
      row.reviewDecision = "REVIEW";
      row.reasons = ["Multiple physical addresses appear collapsed into one row"];
    }
  }

  // Second: deduplicate remaining SAFE rows.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].reviewDecision !== "SAFE") continue;

    const group = [i];

    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].reviewDecision !== "SAFE") continue;
      if (duplicate(rows[i], rows[j])) group.push(j);
    }

    if (group.length <= 1) continue;

    group.sort((a, b) => cleanerScore(rows[b]) - cleanerScore(rows[a]));
    const winner = group[0];

    for (const idx of group.slice(1)) {
      rows[idx].reviewDecision = "REJECT";
      rows[idx].reasons = [
        `Duplicate physical location; cleaner candidate retained from ${rows[winner].sourceUrl}`,
      ];
    }
  }

  const summary = rows.reduce<Record<Decision, number>>(
    (acc, r) => {
      acc[r.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "4",
    sourceReport: "merchant-location-quality-review-v3.json",
    inputV3SafeRows: sourceSafe.length,
    summary,
    rows,
  };

  const outputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v4.json",
  );

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v4 ===");
  console.log(`Input v3 SAFE rows: ${sourceSafe.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);

  console.log("");
  console.log("=== REVIEW / REJECT ===");
  console.table(
    rows
      .filter(r => r.reviewDecision !== "SAFE")
      .map(r => ({
        merchant: r.merchant,
        city: city(r),
        decision: r.reviewDecision,
        reason: (r.reasons || []).join(" | "),
      })),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
