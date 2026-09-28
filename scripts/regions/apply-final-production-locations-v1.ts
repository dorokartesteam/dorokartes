import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

type Row = any;

const BLOCK_MERCHANT_URL: Array<[RegExp, RegExp]> = [
  [/^Anastasiasstore$/i, /%cf%86%cf%8c%cf%81%ce%bc%ce%b1-%ce%b5%cf%80%ce%b9%cf%83%cf%84%cf%81%ce%bf%cf%86/i],
  [/^Djmania$/i, /mikra-hxeia|egkatastaseis/i],
  [/^Fan Pharmacy$/i, /product-category/i],
  [/^Kounelis$/i, /skaptika|frezes|katastrofeis/i],
];

const HARD_REVIEW = new Set([
  "Nextsystems",
  "Treatwell",
  "Winewalkers",
  "for Stay in Greece",
  "Superstrom",
  "Greenmall",
  "Mercato",
]);

function norm(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clean(v: string) {
  return (v || "").replace(/\s+/g, " ").trim();
}

function postal(v: string) {
  const m = v.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function firstStreetNumber(v: string) {
  const m = v.match(/\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/);
  return m ? m[0] : "";
}

function sourceRank(t: string) {
  return t === "MAP_LINK" ? 3 : t === "PAGE_TEXT" ? 2 : t === "JSON_LD" ? 1 : 0;
}

function obviouslyCollapsed(row: Row) {
  const address = String(row.addressLine || "");
  const postals = [...new Set((address.match(/\b\d{3}\s?\d{2}\b/g) || []).map(x => x.replace(/\s/g, "")))];
  const phones = address.match(/\b(?:2\d{9}|69\d{8})\b/g) || [];

  // One Alouette row contains two stores concatenated into one candidate.
  if (row.merchant === "Alouette" && phones.length >= 2 && /Notos Galleries/i.test(address)) return true;

  return postals.length >= 2;
}

function blocked(row: Row) {
  if (HARD_REVIEW.has(row.merchant)) return "Known ambiguous merchant";
  if (obviouslyCollapsed(row)) return "Collapsed multiple locations";
  for (const [merchantRe, urlRe] of BLOCK_MERCHANT_URL) {
    if (merchantRe.test(String(row.merchant || "")) && urlRe.test(String(row.sourceUrl || ""))) {
      return "Weak/non-location source URL false positive";
    }
  }
  return null;
}

function physicalKey(row: Row) {
  const address = clean(row.addressLine || "");
  const p = postal(address) || String(row.postalCode || "").replace(/\s/g, "");
  const city = norm(row.city || "");
  const num = norm(firstStreetNumber(address));

  // Postal + city + first address number is stable enough to collapse alternate
  // MAP/PAGE_TEXT/JSONLD evidence for the same physical point.
  if (p) return `${row.merchantId}|${city}|${p}|${num}`;

  return `${row.merchantId}|${city}|${norm(address).replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 120)}`;
}

function normalizedKey(row: Row) {
  return norm(`${row.city || ""}|${clean(row.addressLine || "")}`)
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
    "merchant-location-production-gate-v1.json"
  );

  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const input: Row[] = report.productionSafe || [];

  const held: Array<Row & { holdReason: string }> = [];
  const allowed: Row[] = [];

  for (const row of input) {
    const why = blocked(row);
    if (why) held.push({ ...row, holdReason: why });
    else allowed.push(row);
  }

  const dedup = new Map<string, Row>();
  for (const row of allowed) {
    const k = physicalKey(row);
    const prev = dedup.get(k);
    if (!prev) {
      dedup.set(k, row);
      continue;
    }

    const a = sourceRank(row.sourceType);
    const b = sourceRank(prev.sourceType);

    if (a > b || (a === b && clean(row.addressLine || "").length < clean(prev.addressLine || "").length)) {
      dedup.set(k, row);
    }
  }

  const finalRows = [...dedup.values()];

  console.log("=== FINAL PRODUCTION LOCATION APPLY v1 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Input PRODUCTION_SAFE rows: ${input.length}`);
  console.log(`Held back: ${held.length}`);
  console.log(`After physical-location dedupe: ${finalRows.length}`);

  console.log("");
  console.log("=== HELD BACK ===");
  console.table(held.map(r => ({
    merchant: r.merchant,
    city: r.city,
    reason: r.holdReason,
    sourceUrl: r.sourceUrl,
  })));

  console.log("");
  console.log("=== FINAL WRITE PREVIEW ===");
  console.table(finalRows.map(r => ({
    merchant: r.merchant,
    city: r.city,
    sourceType: r.sourceType,
    address: clean(r.addressLine || ""),
  })));

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN ONLY — database unchanged.");
    await prisma.$disconnect();
    return;
  }

  let createdOrUpdated = 0;

  for (const row of finalRows) {
    const addressLine = clean(row.addressLine || "");
    const nk = normalizedKey(row);

    await prisma.merchantLocation.upsert({
      where: {
        merchantId_normalizedKey: {
          merchantId: row.merchantId,
          normalizedKey: nk,
        },
      },
      create: {
        merchantId: row.merchantId,
        label: row.label ?? null,
        countryCode: "GR",
        administrativeArea: row.administrativeArea ?? null,
        city: row.city || "Unknown",
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || postal(addressLine) || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        normalizedKey: nk,
        sourceUrl: row.sourceUrl,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        label: row.label ?? null,
        administrativeArea: row.administrativeArea ?? null,
        city: row.city || "Unknown",
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || postal(addressLine) || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        sourceUrl: row.sourceUrl,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });

    createdOrUpdated++;
  }

  console.log("");
  console.log(`APPLIED VERIFIED LOCATION ROWS: ${createdOrUpdated}`);
  console.log(`HELD BACK / NOT WRITTEN: ${held.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
