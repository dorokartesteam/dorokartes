import "dotenv/config";
import { createHash } from "node:crypto";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function fingerprint(sourceUrl: string, merchantName: string) {
  return createHash("sha256")
    .update(`OFFICIAL|${sourceUrl.replace(/\/$/, "")}|${merchantName.toLocaleLowerCase("el-GR")}`)
    .digest("hex");
}

async function setCanonicalForDomain(
  domainNeedle: string,
  canonicalUrl: string,
  status: DiscoveryStatus,
  merchantName?: string,
) {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      OR: [
        { sourceUrl: { contains: domainNeedle } },
        { possibleOfficialUrl: { contains: domainNeedle } },
      ],
    },
  });

  const winner = rows.find(
    (row) => row.sourceUrl.replace(/\/$/, "") === canonicalUrl.replace(/\/$/, ""),
  );

  if (!winner) {
    throw new Error(
      `Canonical row not found for ${domainNeedle}: ${canonicalUrl}`,
    );
  }

  await prisma.discoveryItem.update({
    where: { id: winner.id },
    data: {
      status,
      merchantName: merchantName ?? winner.merchantName,
      processedAt: new Date(),
      notes: `${winner.notes ?? ""} | Core canonical override: selected as canonical official gift-card URL.`,
    },
  });

  for (const row of rows) {
    if (row.id === winner.id) continue;

    if (
      row.status === DiscoveryStatus.REJECTED ||
      row.status === DiscoveryStatus.ERROR
    ) {
      continue;
    }

    await prisma.discoveryItem.update({
      where: { id: row.id },
      data: {
        status: DiscoveryStatus.DUPLICATE,
        processedAt: new Date(),
        notes: `${row.notes ?? ""} | Core canonical override: secondary URL under ${canonicalUrl}.`,
      },
    });
  }

  console.log(`[OK] ${domainNeedle} -> ${canonicalUrl}`);
}

async function ensureIkeaCanonical() {
  const canonicalUrl = "https://www.ikea.gr/agora-dorokartas-ikea/";
  const merchantName = "IKEA";
  const existing = await prisma.discoveryItem.findFirst({
    where: { sourceUrl: canonicalUrl },
  });

  let winnerId: string;

  if (existing) {
    const updated = await prisma.discoveryItem.update({
      where: { id: existing.id },
      data: {
        sourceType: SourceType.OFFICIAL,
        sourceName: "Official Websites",
        merchantName,
        title: "IKEA Gift Card",
        possibleOfficialUrl: "https://www.ikea.gr",
        status: DiscoveryStatus.VERIFIED,
        processedAt: new Date(),
        notes: `${existing.notes ?? ""} | Core canonical override: official IKEA Greece gift-card page.`,
      },
    });
    winnerId = updated.id;
  } else {
    const created = await prisma.discoveryItem.create({
      data: {
        sourceType: SourceType.OFFICIAL,
        sourceName: "Official Websites",
        sourceUrl: canonicalUrl,
        title: "IKEA Gift Card",
        merchantName,
        possibleOfficialUrl: "https://www.ikea.gr",
        fingerprint: fingerprint(canonicalUrl, merchantName),
        status: DiscoveryStatus.VERIFIED,
        processedAt: new Date(),
        notes: "Core canonical override: official IKEA Greece gift-card page.",
      },
    });
    winnerId = created.id;
  }

  const ikeaRows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      OR: [
        { sourceUrl: { contains: "ikea.gr" } },
        { possibleOfficialUrl: { contains: "ikea.gr" } },
      ],
    },
  });

  for (const row of ikeaRows) {
    if (row.id === winnerId) continue;
    if (row.status === DiscoveryStatus.REJECTED) continue;

    await prisma.discoveryItem.update({
      where: { id: row.id },
      data: {
        status: DiscoveryStatus.DUPLICATE,
        processedAt: new Date(),
        notes: `${row.notes ?? ""} | Core canonical override: supporting IKEA URL under ${canonicalUrl}.`,
      },
    });
  }

  console.log(`[OK] ikea.gr -> ${canonicalUrl}`);
}

async function main() {
  // Prefer the stable Greek landing page, not language variants/checkout pages.
  await setCanonicalForDomain(
    "skyexpress.gr",
    "https://www.skyexpress.gr/el/book/sky-gift",
    DiscoveryStatus.VERIFIED,
    "SKY express",
  );

  // Prefer the resolved dedicated gift-card page instead of a generic alias.
  const atticaCandidates = [
    "https://www.atticadps.gr/attica-dwrokarta/",
    "https://atticadps.gr/attica-dwrokarta",
  ];

  let atticaApplied = false;
  for (const url of atticaCandidates) {
    const found = await prisma.discoveryItem.findFirst({
      where: { sourceUrl: url },
    });

    if (found) {
      await setCanonicalForDomain(
        "atticadps.gr",
        url,
        DiscoveryStatus.VERIFIED,
        "attica",
      );
      atticaApplied = true;
      break;
    }
  }

  if (!atticaApplied) {
    throw new Error("No attica dedicated gift-card row found.");
  }

  // Add/fix the actual Greek IKEA gift-card landing page.
  await ensureIkeaCanonical();

  console.log("");
  console.log("Core canonical fixes completed.");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
