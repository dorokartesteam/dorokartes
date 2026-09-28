import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

type Row = {
  merchantId: string;
  merchant: string;
  city: string | null;
  area?: string | null;
  administrativeArea?: string | null;
  addressLine: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl: string | null;
  sourceExcerpt?: string | null;
};

const ALLOW = new Set([
  "Spaprive",
  "Tinycocoon",
  "Trollbeads",
  "VapeLux",
  "Xxlove",
  "για πρωτότυπα και όμορφα δώρα!",
]);

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function key(v: string) {
  return norm(v)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function clean(v: string) {
  return v.replace(/\s+/g, " ").trim();
}

function inferPostal(v: string) {
  const m = v.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-master-pass-v1.3.json"
  );

  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    safe: Row[];
  };

  const picked = (report.safe || []).filter(x => ALLOW.has(x.merchant));
  const missing = [...ALLOW].filter(name => !picked.some(x => x.merchant === name));

  console.log("=== FINAL SAFE FROM MASTER v1 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Selected rows: ${picked.length}`);
  console.log(`Missing picks: ${missing.length}`);

  if (missing.length) {
    console.table(missing.map(merchant => ({ merchant })));
    console.log("STOP — database unchanged.");
    await prisma.$disconnect();
    process.exitCode = 2;
    return;
  }

  for (const row of picked) {
    console.log(`${row.merchant} — ${row.city} — ${row.addressLine}`);

    if (!APPLY) continue;

    const addressLine = clean(row.addressLine || "");
    const normalizedKey = key(`${row.city}|${addressLine}`);

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
        administrativeArea: row.administrativeArea ?? null,
        city: row.city!,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || inferPostal(addressLine),
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        normalizedKey,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        administrativeArea: row.administrativeArea ?? null,
        city: row.city!,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || inferPostal(addressLine),
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });
  }

  if (!APPLY) console.log("DRY RUN ONLY — database unchanged.");

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
