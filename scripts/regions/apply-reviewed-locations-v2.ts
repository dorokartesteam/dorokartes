import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v2.json",
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

  const safeRows = report.rows.filter(
    (row) =>
      row.reviewDecision === "SAFE" &&
      row.normalizedCity &&
      row.addressLine &&
      row.sourceUrl,
  );

  console.log("=== DOROKARTES VERIFIED LOCATION APPLY v2 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`SAFE rows: ${safeRows.length}`);

  for (const row of safeRows) {
    console.log(`${row.merchant} — ${row.normalizedCity} — ${row.addressLine}`);

    if (!APPLY) continue;

    const normalizedKey = normalizeKey(
      `${row.normalizedCity}|${row.addressLine}`,
    );

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

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN ONLY — database unchanged.");
    console.log(
      "Apply only after reviewing this output with: npx tsx .\\scripts\\regions\\apply-reviewed-locations-v2.ts --apply",
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
