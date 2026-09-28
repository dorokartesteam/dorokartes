import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

function key(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v3.json",
  );

  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    rows: Array<{
      merchantId: string;
      merchant: string;
      normalizedCity: string | null;
      normalizedAdministrativeArea: string | null;
      area: string | null;
      addressLine: string | null;
      postalCode: string | null;
      sourceUrl: string | null;
      sourceExcerpt: string | null;
      reviewDecision: "SAFE" | "REVIEW" | "REJECT";
    }>;
  };

  const rows = report.rows.filter(
    row =>
      row.reviewDecision === "SAFE" &&
      row.normalizedCity &&
      row.addressLine &&
      row.sourceUrl,
  );

  console.log("=== VERIFIED LOCATION APPLY v3 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Final SAFE rows: ${rows.length}`);
  console.log("");

  for (const row of rows) {
    console.log(`${row.merchant} — ${row.normalizedCity} — ${row.addressLine}`);

    if (!APPLY) continue;

    const normalizedKey = key(`${row.normalizedCity}|${row.addressLine}`);

    await prisma.merchantLocation.upsert({
      where: {
        merchantId_normalizedKey: {
          merchantId: row.merchantId,
          normalizedKey,
        },
      },
      create: {
        merchantId: row.merchantId,
        label: null,
        countryCode: "GR",
        administrativeArea: row.normalizedAdministrativeArea,
        city: row.normalizedCity!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        latitude: null,
        longitude: null,
        normalizedKey,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        administrativeArea: row.normalizedAdministrativeArea,
        city: row.normalizedCity!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });
  }

  console.log("");
  if (!APPLY) {
    console.log("DRY RUN ONLY — database unchanged.");
    console.log("After review, apply with:");
    console.log("npx tsx .\\scripts\\regions\\apply-reviewed-locations-v3.ts --apply");
  } else {
    console.log(`APPLIED ${rows.length} verified merchant locations.`);
  }

  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
