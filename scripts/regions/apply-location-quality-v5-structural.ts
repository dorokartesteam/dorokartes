import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

function key(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v5-structural.json",
  );

  const report = JSON.parse(await fs.readFile(p, "utf8")) as {
    rows: Array<{
      merchantId: string;
      merchant: string;
      city: string | null;
      area: string | null;
      administrativeArea: string | null;
      addressLine: string | null;
      postalCode: string | null;
      latitude: number | null;
      longitude: number | null;
      sourceUrl: string | null;
      sourceExcerpt: string | null;
      reviewDecision: "SAFE" | "REVIEW" | "REJECT";
    }>;
  };

  const rows = report.rows.filter(
    r => r.reviewDecision === "SAFE" && r.city && r.addressLine && r.sourceUrl,
  );

  console.log("=== VERIFIED LOCATION APPLY — V5 STRUCTURAL ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Final SAFE rows: ${rows.length}`);

  for (const row of rows) {
    console.log(`${row.merchant} — ${row.city} — ${row.addressLine}`);

    if (!APPLY) continue;

    const normalizedKey = key(`${row.city}|${row.addressLine}`);

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
        administrativeArea: row.administrativeArea,
        city: row.city!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        latitude: row.latitude,
        longitude: row.longitude,
        normalizedKey,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        administrativeArea: row.administrativeArea,
        city: row.city!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        latitude: row.latitude,
        longitude: row.longitude,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });
  }

  if (!APPLY) console.log("DRY RUN ONLY — database unchanged.");
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
