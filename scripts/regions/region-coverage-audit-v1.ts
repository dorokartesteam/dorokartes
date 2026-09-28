import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Bucket =
  | "VERIFIED_CAPABILITY"
  | "MERCHANT_LOCATIONS_NO_CAPABILITY"
  | "NO_VERIFIED_LOCATION";

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      merchant: { status: "ACTIVE" },
    },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          locations: {
            where: { active: true, verificationStatus: "VERIFIED" },
            select: {
              id: true,
              city: true,
              area: true,
              administrativeArea: true,
              addressLine: true,
            },
          },
        },
      },
      locationCapabilities: {
        where: { available: true, verificationStatus: "VERIFIED" },
        select: {
          capability: true,
          merchantLocation: {
            select: {
              id: true,
              city: true,
              area: true,
              administrativeArea: true,
              addressLine: true,
            },
          },
        },
      },
    },
  });

  const rows = cards.map((card) => {
    const verifiedCapabilities = card.locationCapabilities.length;
    const verifiedLocations = card.merchant.locations.length;

    const bucket: Bucket =
      verifiedCapabilities > 0
        ? "VERIFIED_CAPABILITY"
        : verifiedLocations > 0
          ? "MERCHANT_LOCATIONS_NO_CAPABILITY"
          : "NO_VERIFIED_LOCATION";

    return {
      giftCardId: card.id,
      merchant: card.merchant.name,
      merchantSlug: card.merchant.slug,
      giftCard: card.title,
      giftCardSlug: card.slug,
      officialUrl: card.officialUrl,
      verifiedLocations,
      verifiedCapabilities,
      cities: [...new Set(card.merchant.locations.map((x) => x.city))],
      capabilityCities: [
        ...new Set(card.locationCapabilities.map((x) => x.merchantLocation.city)),
      ],
      bucket,
    };
  });

  const counts = rows.reduce<Record<Bucket, number>>(
    (acc, row) => {
      acc[row.bucket]++;
      return acc;
    },
    {
      VERIFIED_CAPABILITY: 0,
      MERCHANT_LOCATIONS_NO_CAPABILITY: 0,
      NO_VERIFIED_LOCATION: 0,
    },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    scope: "ACTIVE + VERIFIED gift cards of ACTIVE merchants",
    totalCards: rows.length,
    counts,
    rows,
  };

  const dir = path.resolve(process.cwd(), "reports", "regions");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "region-coverage-audit-v1.json"),
    JSON.stringify(output, null, 2),
    "utf8",
  );

  console.log("=== DOROKARTES REGION COVERAGE AUDIT v1 ===");
  console.log(`Total active + verified cards: ${rows.length}`);
  console.log(`Already with verified location capability: ${counts.VERIFIED_CAPABILITY}`);
  console.log(
    `Merchant has verified locations but card has no capability: ${counts.MERCHANT_LOCATIONS_NO_CAPABILITY}`,
  );
  console.log(`No verified merchant location: ${counts.NO_VERIFIED_LOCATION}`);
  console.log(
    "Report: reports/regions/region-coverage-audit-v1.json",
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
