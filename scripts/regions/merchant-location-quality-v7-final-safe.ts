import fs from "node:fs/promises";
import path from "node:path";

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

function hardReject(row: Row) {
  const t = norm(`${row.merchant} ${row.addressLine || ""} ${row.sourceUrl || ""}`);

  const exactMerchantReview = new Set([
    "antonella",
    "crudeshop",
    "happydonkey",
    "honeykids",
    "legacyapparel",
    "pocolocojewellery",
    "vicious cycles athens",
    "vitaspis",
  ]);

  if (exactMerchantReview.has(norm(row.merchant))) {
    return "Targeted manual review merchant";
  }

  const badSignals = [
    "a1, 121 37",
    "physical address:",
    "policies/contact-information",
    "αριθμος γεμη",
    "αριθμός γεμη",
    "trade number",
    "vat number",
  ];

  if (badSignals.some(x => t.includes(norm(x)))) {
    return "Policy/legal/malformed-address signal";
  }

  if (postals(row.addressLine).length !== 1) {
    return "Address does not contain exactly one postal code";
  }

  return null;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v6-high-confidence.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const source = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows = source.map(row => {
    const reason = hardReject(row);

    if (reason) {
      return {
        ...row,
        reviewDecision: "REVIEW" as Decision,
        reasons: [reason],
      };
    }

    return {
      ...row,
      reviewDecision: "SAFE" as Decision,
      reasons: [] as string[],
    };
  });

  const summary = rows.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "7-final-safe",
    inputV6SafeRows: source.length,
    summary,
    rows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v7-final-safe.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v7 FINAL SAFE ===");
  console.log(`Input v6 SAFE rows: ${source.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
