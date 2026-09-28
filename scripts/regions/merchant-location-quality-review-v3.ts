import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Decision = "SAFE" | "REVIEW" | "REJECT";

type Row = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
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

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBoilerplate(value?: string | null) {
  let t = normalize(value);
  const junk = [
    "address", "contact", "phone", "telephone", "email", "show on map",
    "opening hours", "hours", "find us on the map", "location",
    "greece", "gr", "zip", "tk", "τ κ", "διευθυνση", "τηλ",
    "επικοινωνια", "τοποθεσια", "powered by core it",
  ];
  for (const token of junk) {
    t = t.replaceAll(token, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

function postal(value?: string | null) {
  const m = normalize(value).match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function numbers(value?: string | null) {
  return [...normalize(value).matchAll(/\b\d{1,4}\b/g)].map(x => x[0]);
}

function streetTokens(value?: string | null) {
  const stop = new Set([
    "athens","athina","piraeus","thessaloniki","chania","heraklion","mykonos",
    "santorini","rethymno","patra","larissa","volos","corfu","greece",
    "αθηνα","πειραιας","θεσσαλονικη","χανια","ηρακλειο","μυκονος","σαντορινη",
    "ρεθυμνο","πατρα","λαρισα","βολος","κερκυρα",
    "street","str","avenue","ave","road","rd","square","οδος","λεωφορος",
    "address","contact","shop","store","stores","hotel",
  ]);
  return stripBoilerplate(value)
    .split(" ")
    .filter(t => t.length >= 3 && !stop.has(t) && !/^\d+$/.test(t));
}

function similarity(a?: string | null, b?: string | null) {
  const A = new Set(streetTokens(a));
  const B = new Set(streetTokens(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / Math.min(A.size, B.size);
}

function likelySameAddress(a: Row, b: Row) {
  if (a.merchantId !== b.merchantId) return false;
  const cityA = normalize(a.normalizedCity || a.city);
  const cityB = normalize(b.normalizedCity || b.city);
  if (cityA !== cityB) return false;

  const pa = postal(a.addressLine);
  const pb = postal(b.addressLine);
  const na = numbers(a.addressLine);
  const nb = numbers(b.addressLine);
  const numberOverlap = na.some(n => nb.includes(n));

  if (pa && pb && pa !== pb) return false;
  if (pa && pb && pa === pb && similarity(a.addressLine, b.addressLine) >= 0.35) return true;
  return numberOverlap && similarity(a.addressLine, b.addressLine) >= 0.55;
}

function hasReturnContext(row: Row) {
  const t = normalize(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);
  return [
    "returns policy",
    "return policy",
    "returns address",
    "return address",
    "please post all returns",
    "επιστροφ",
  ].some(x => t.includes(x));
}

function combinedAddressSignals(row: Row) {
  const t = normalize(row.addressLine);
  const postalCodes = [...new Set(
    [...t.matchAll(/\b\d{3}\s?\d{2}\b/g)].map(m => m[0].replace(/\s+/g, ""))
  )];

  const pinCount =
    (row.addressLine?.match(/📍/g) || []).length +
    (t.match(/\baddress\b/g) || []).length;

  // Multiple distinct postal codes or explicit multiple location markers usually means
  // several physical points have been collapsed into one row.
  return postalCodes.length > 1 || pinCount > 1;
}

function incompletePhysicalAddress(row: Row) {
  const t = normalize(row.addressLine);
  const pc = postal(row.addressLine);
  const nums = numbers(row.addressLine);

  // Do not auto-verify a location with only city/ZIP or only a road without useful numbering.
  if (!pc && nums.length === 0) return true;
  if (t.length < 14) return true;
  return false;
}

function cleanerScore(row: Row) {
  let score = 0;
  const t = normalize(row.addressLine);

  if (postal(row.addressLine)) score += 5;
  if (numbers(row.addressLine).length) score += 3;
  if (row.sourceUrl && /contact|store|location|katast|epikoin/i.test(row.sourceUrl)) score += 4;
  if (t.includes("contact") || t.includes("address")) score += 1;
  if (hasReturnContext(row)) score -= 20;
  if (combinedAddressSignals(row)) score -= 10;
  score -= Math.max(0, (row.addressLine?.length || 0) - 180) / 50;

  return score;
}

async function main() {
  const inPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v2.json",
  );

  const input = JSON.parse(await fs.readFile(inPath, "utf8")) as { rows: Row[] };
  const originalSafe = input.rows.filter(r => r.reviewDecision === "SAFE");

  const staged = originalSafe.map(row => {
    const reasons: string[] = [];

    if (hasReturnContext(row)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Return-policy/returns context"] };
    }

    if (combinedAddressSignals(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Multiple addresses appear collapsed into one row"] };
    }

    if (incompletePhysicalAddress(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Physical address is incomplete"] };
    }

    return { ...row, reviewDecision: "SAFE" as Decision, reasons };
  });

  // De-duplicate same merchant/location, retaining the cleanest official source row.
  const safe = staged.filter(r => r.reviewDecision === "SAFE");
  const consumed = new Set<number>();

  for (let i = 0; i < safe.length; i++) {
    if (consumed.has(i)) continue;

    const group = [i];
    for (let j = i + 1; j < safe.length; j++) {
      if (!consumed.has(j) && likelySameAddress(safe[i], safe[j])) group.push(j);
    }

    if (group.length <= 1) continue;

    group.sort((a, b) => cleanerScore(safe[b]) - cleanerScore(safe[a]));
    const keep = group[0];

    for (const idx of group.slice(1)) {
      consumed.add(idx);
      safe[idx].reviewDecision = "REJECT";
      safe[idx].reasons = [
        `Duplicate of cleaner candidate kept for ${safe[keep].merchant} / ${safe[keep].normalizedCity || safe[keep].city}`,
      ];
    }
  }

  // Detect same merchant + city + suspiciously conflicting street numbers/names.
  const remainingSafe = safe.filter(r => r.reviewDecision === "SAFE");
  const groups = new Map<string, Row[]>();

  for (const row of remainingSafe) {
    const key = `${row.merchantId}|${normalize(row.normalizedCity || row.city)}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];

        // Multiple genuinely different branches in one city are allowed.
        // Only flag near-duplicate text that disagrees on key house numbers.
        const sim = similarity(a.addressLine, b.addressLine);
        const numsA = new Set(numbers(a.addressLine));
        const numsB = new Set(numbers(b.addressLine));
        const overlap = [...numsA].some(n => numsB.has(n));

        if (sim >= 0.55 && !overlap) {
          a.reviewDecision = "REVIEW";
          b.reviewDecision = "REVIEW";
          a.reasons = [...(a.reasons || []), "Near-duplicate location text with conflicting street numbers"];
          b.reasons = [...(b.reasons || []), "Near-duplicate location text with conflicting street numbers"];
        }
      }
    }
  }

  const finalRows = staged;
  const summary = finalRows.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "3",
    sourceReport: "merchant-location-quality-review-v2.json",
    inputV2SafeRows: originalSafe.length,
    summary,
    rows: finalRows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v3.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v3 ===");
  console.log(`Input v2 SAFE rows: ${originalSafe.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);

  console.log("");
  console.log("=== REVIEW / REJECT ===");
  console.table(
    finalRows
      .filter(r => r.reviewDecision !== "SAFE")
      .map(r => ({
        merchant: r.merchant,
        city: r.normalizedCity || r.city,
        decision: r.reviewDecision,
        reason: (r.reasons || []).join(" | "),
      })),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
