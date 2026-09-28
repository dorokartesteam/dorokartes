import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type ReviewDecision = "SAFE" | "REVIEW" | "REJECT";

type InputRow = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: string;
};

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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

const BAD_ADDRESS_TERMS = [
  "επιστροφή",
  "επιστροφ",
  "return",
  "returns",
  "όροι",
  "terms",
  "privacy",
  "πολιτική",
  "policy",
  "cookie",
  "copyright",
  "all rights reserved",
  "courier",
  "παράδοση",
  "delivery",
];

const ADDRESS_HINTS = [
  "οδός",
  "οδος",
  "street",
  "str.",
  "avenue",
  "ave.",
  "road",
  "rd.",
  "λεωφ",
  "λεωφόρος",
  "πλατεία",
  "square",
];

function hasAddressShape(text: string) {
  const t = normalize(text);
  const hasNumber = /\b\d{1,4}\b/.test(t);
  const hasPostal = /\b\d{3}\s?\d{2}\b/.test(t);
  const hasHint = ADDRESS_HINTS.some((term) => t.includes(normalize(term)));
  return (hasNumber && hasHint) || hasPostal;
}

function badContext(text: string) {
  const t = normalize(text);
  return BAD_ADDRESS_TERMS.some((term) => t.includes(normalize(term)));
}

function reviewRow(row: InputRow) {
  const reasons: string[] = [];
  const sourceUrl = row.sourceUrl || "";
  const websiteUrl = row.websiteUrl || "";
  const address = row.addressLine || "";
  const excerpt = row.sourceExcerpt || "";

  if (!row.city || !row.addressLine || !row.sourceUrl) {
    return {
      ...row,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Missing city/address/sourceUrl"],
    };
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return {
      ...row,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Invalid source URL"],
    };
  }

  if (websiteUrl && !sameDomain(sourceUrl, websiteUrl)) {
    return {
      ...row,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Source URL is not on merchant official domain"],
    };
  }

  if (!hasAddressShape(address)) {
    reasons.push("Address string does not strongly resemble a postal address");
  }

  if (badContext(excerpt)) {
    reasons.push("Source excerpt contains non-location boilerplate/context");
  }

  const cityNorm = normalize(row.city);
  const combined = normalize(`${address} ${excerpt}`);
  if (cityNorm && !combined.includes(cityNorm)) {
    reasons.push("City is not visible in address/excerpt text");
  }

  const postal = row.postalCode?.replace(/\s+/g, "");
  if (postal && !/^\d{5}$/.test(postal)) {
    reasons.push("Postal code format is not 5 digits");
  }

  const decision: ReviewDecision =
    reasons.length === 0 ? "SAFE" : reasons.length >= 2 ? "REJECT" : "REVIEW";

  return {
    ...row,
    reviewDecision: decision,
    reasons,
  };
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v1-dry-run.json",
  );

  const raw = JSON.parse(await fs.readFile(inputPath, "utf8")) as {
    rows: InputRow[];
  };

  const candidates = raw.rows.filter((row) => row.decision === "SAFE_TO_APPLY");
  const reviewed = candidates.map(reviewRow);

  const summary = reviewed.reduce<Record<ReviewDecision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sourceReport: "merchant-location-discovery-v1-dry-run.json",
    inputSafeToApplyRows: candidates.length,
    summary,
    rows: reviewed,
  };

  const outputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v1.json",
  );

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v1 ===");
  console.log(`Input SAFE_TO_APPLY rows: ${candidates.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);

  console.log("");
  console.log("=== REVIEW / REJECT SAMPLE ===");
  console.table(
    reviewed
      .filter((row) => row.reviewDecision !== "SAFE")
      .slice(0, 30)
      .map((row) => ({
        merchant: row.merchant,
        city: row.city,
        decision: row.reviewDecision,
        reason: row.reasons.join(" | "),
      })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
