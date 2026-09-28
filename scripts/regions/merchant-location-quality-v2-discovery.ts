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
  sourceType: "JSON_LD" | "PAGE_TEXT" | "MAP_LINK" | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: string;
};

function norm(v?: string | null) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function host(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sameDomain(a?: string | null, b?: string | null) {
  const ah = host(a);
  const bh = host(b);
  if (!ah || !bh) return false;
  return ah === bh || ah.endsWith(`.${bh}`) || bh.endsWith(`.${ah}`);
}

function postal(v?: string | null) {
  const m = norm(v).match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function allPostals(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b(\d{3})\s?(\d{2})\b/g)].map(m => `${m[1]}${m[2]}`)
  )];
}

function streetNumbers(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b\d{1,4}(?:-\d{1,4})?\b/g)].map(m => m[0])
  )];
}

function hasReturnContext(row: Row) {
  const t = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""} ${row.sourceUrl || ""}`);
  return [
    "returns policy",
    "return policy",
    "returns address",
    "return address",
    "please post all returns",
    "επιστροφ",
  ].some(x => t.includes(x));
}

function outsideGreece(row: Row) {
  const t = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);
  return [
    "united states",
    "usa",
    "athens georgia",
    "georgia 306",
    "united kingdom",
    "london uk",
    "cyprus",
    "nicosia",
    "limassol",
  ].some(x => t.includes(x));
}

function multipleAddresses(row: Row) {
  const pcs = allPostals(row.addressLine);
  if (pcs.length >= 2) return true;

  const t = norm(row.addressLine);
  const keywords = (t.match(/\b(address|street|str|avenue|road|διευθυνση|location)\b/g) || []).length;
  if (keywords >= 2 && streetNumbers(row.addressLine).length >= 2 && t.length > 120) {
    return true;
  }

  return false;
}

function weakAddress(row: Row) {
  const t = norm(row.addressLine);
  if (!t) return true;
  const hasPostal = !!postal(row.addressLine);
  const hasNumber = streetNumbers(row.addressLine).length > 0;
  if (!hasPostal && !hasNumber) return true;
  if (t.length < 12) return true;
  return false;
}

function score(row: Row) {
  let s = 0;
  if (row.sourceType === "JSON_LD") s += 10;
  if (row.sourceType === "MAP_LINK") s += 6;
  if (row.sourceType === "PAGE_TEXT") s += 4;
  if (postal(row.addressLine)) s += 3;
  if (streetNumbers(row.addressLine).length) s += 2;
  if (row.latitude != null && row.longitude != null) s += 3;
  if (row.sourceUrl && /contact|store|stores|location|katast|epikoin/i.test(row.sourceUrl)) s += 4;
  if (hasReturnContext(row)) s -= 20;
  if (multipleAddresses(row)) s -= 10;
  return s;
}

function tokenSet(v?: string | null) {
  const stop = new Set([
    "athens","thessaloniki","chania","piraeus","greece","mykonos","santorini",
    "street","str","avenue","road","address","contact","store","stores","location",
    "αθηνα","θεσσαλονικη","χανια","πειραιας","μυκονος","σαντορινη"
  ]);

  return new Set(
    norm(v)
      .split(/\s+/)
      .filter(x => x.length >= 3 && !stop.has(x) && !/^\d+$/.test(x))
  );
}

function similarity(a?: string | null, b?: string | null) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / Math.min(A.size, B.size);
}

function duplicate(a: Row, b: Row) {
  if (a.merchantId !== b.merchantId) return false;
  if (norm(a.city) !== norm(b.city)) return false;

  const pa = postal(a.addressLine);
  const pb = postal(b.addressLine);
  const samePostal = pa && pb && pa === pb;

  const na = streetNumbers(a.addressLine);
  const nb = streetNumbers(b.addressLine);
  const sharedNum = na.some(n => nb.includes(n));

  const sim = similarity(a.addressLine, b.addressLine);

  return (
    (samePostal && sim >= 0.25) ||
    (samePostal && sharedNum) ||
    (sharedNum && sim >= 0.5)
  );
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v2-dry-run.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const candidates = input.rows.filter(r => r.decision === "SAFE_CANDIDATE");

  const reviewed = candidates.map(row => {
    const reasons: string[] = [];

    if (!row.sourceUrl || !row.addressLine || !row.city) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Missing source/address/city"] };
    }

    if (!sameDomain(row.sourceUrl, row.websiteUrl)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Source is outside official merchant domain"] };
    }

    if (outsideGreece(row)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Location appears outside Greece"] };
    }

    if (hasReturnContext(row)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Returns-only context"] };
    }

    if (multipleAddresses(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Multiple physical addresses collapsed into one row"] };
    }

    if (weakAddress(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Address evidence is incomplete/weak"] };
    }

    return { ...row, reviewDecision: "SAFE" as Decision, reasons };
  });

  // De-duplicate SAFE rows, keeping strongest evidence.
  const safeIndexes = reviewed
    .map((r, i) => ({ r, i }))
    .filter(x => x.r.reviewDecision === "SAFE");

  const used = new Set<number>();

  for (let i = 0; i < safeIndexes.length; i++) {
    const a = safeIndexes[i];
    if (used.has(a.i) || reviewed[a.i].reviewDecision !== "SAFE") continue;

    const group = [a.i];

    for (let j = i + 1; j < safeIndexes.length; j++) {
      const b = safeIndexes[j];
      if (used.has(b.i) || reviewed[b.i].reviewDecision !== "SAFE") continue;
      if (duplicate(reviewed[a.i], reviewed[b.i])) group.push(b.i);
    }

    if (group.length <= 1) continue;

    group.sort((x, y) => score(reviewed[y]) - score(reviewed[x]));
    const winner = group[0];

    for (const idx of group.slice(1)) {
      used.add(idx);
      reviewed[idx].reviewDecision = "REJECT";
      reviewed[idx].reasons = [
        `Duplicate candidate; cleaner evidence retained from ${reviewed[winner].sourceUrl}`,
      ];
    }
  }

  const summary = reviewed.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "2-discovery",
    inputCandidates: candidates.length,
    summary,
    rows: reviewed,
  };

  const outputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v2-discovery.json",
  );

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW — DISCOVERY v2 ===");
  console.log(`Input candidates: ${candidates.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);

  console.log("");
  console.log("=== REVIEW / REJECT SAMPLE ===");
  console.table(
    reviewed
      .filter(r => r.reviewDecision !== "SAFE")
      .slice(0, 50)
      .map(r => ({
        merchant: r.merchant,
        city: r.city,
        sourceType: r.sourceType,
        decision: r.reviewDecision,
        reason: r.reasons.join(" | "),
      })),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
