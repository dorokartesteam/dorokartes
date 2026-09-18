import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
  MerchantStatus,
  GiftCardStatus,
  VerificationStatus,
  VerificationResult,
  GiftCardVariantType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

type CanonicalRow = {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string;
  title: string | null;
  merchantName: string | null;
  status: DiscoveryStatus;
  possibleOfficialUrl: string | null;
  notes: string | null;
  discoveredAt: Date;
  processedAt: Date | null;
};

type Overrides = Record<string, string>;

function slugify(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function domainOf(input: string) {
  const url = new URL(input);
  return (
    getDomain(url.hostname, { allowPrivateDomains: true }) ??
    url.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function websiteFrom(row: CanonicalRow) {
  if (row.possibleOfficialUrl) {
    try {
      return new URL(row.possibleOfficialUrl).origin;
    } catch {}
  }

  const url = new URL(row.sourceUrl);
  return `${url.protocol}//${url.hostname}`;
}

function looksGenericMerchantName(value?: string | null) {
  if (!value) return true;
  const v = value.trim().toLocaleLowerCase("el-GR");

  return [
    "gift card",
    "giftcard",
    "δωροκάρτα",
    "δωροκαρτα",
    "gift voucher",
    "official websites",
  ].includes(v);
}

function cleanDomainName(domain: string) {
  const base = domain.split(".")[0];
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveMerchantName(
  row: CanonicalRow,
  domain: string,
  overrides: Overrides,
) {
  if (overrides[domain]) return overrides[domain];

  if (!looksGenericMerchantName(row.merchantName)) {
    const value = row.merchantName!.trim();

    // Avoid keeping page-title-like merchant names.
    if (value.length <= 45 && !value.includes("#1")) return value;
  }

  if (
    row.sourceName &&
    row.sourceName !== "Official Websites" &&
    row.sourceName !== "Official Website Verifier" &&
    row.sourceName.length <= 45
  ) {
    return row.sourceName.trim();
  }

  return cleanDomainName(domain);
}

function giftCardTitle(merchantName: string) {
  return `${merchantName} Gift Card`;
}

function detectVariantType(row: CanonicalRow) {
  const text = `${row.title ?? ""} ${row.sourceUrl} ${row.notes ?? ""}`
    .toLocaleLowerCase("el-GR");

  const digitalSignals = [
    "e-gift",
    "egift",
    "e gift",
    "email",
    "instant",
    "send-gift-card",
    "digital",
  ];

  if (digitalSignals.some((signal) => text.includes(signal))) {
    return GiftCardVariantType.DIGITAL;
  }

  // Do not invent physical/digital availability when the source does not prove it.
  return null;
}

async function loadOverrides(): Promise<Overrides> {
  const path = resolve(
    process.cwd(),
    "data/discovery/merchant-name-overrides.json",
  );

  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return {};
  }
}

async function canonicalVerifiedRows() {
  return prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: DiscoveryStatus.VERIFIED,
      NOT: {
        sourceName: "Official Website Verifier",
      },
    },
    select: {
      id: true,
      sourceType: true,
      sourceName: true,
      sourceUrl: true,
      title: true,
      merchantName: true,
      status: true,
      possibleOfficialUrl: true,
      notes: true,
      discoveredAt: true,
      processedAt: true,
    },
    orderBy: {
      sourceUrl: "asc",
    },
  });
}

async function main() {
  const overrides = await loadOverrides();
  const rows = await canonicalVerifiedRows();

  // Safety: canonicalization should have left at most one VERIFIED row per domain.
  const grouped = new Map<string, CanonicalRow[]>();

  for (const row of rows) {
    const domain = domainOf(row.sourceUrl);
    const list = grouped.get(domain) ?? [];
    list.push(row);
    grouped.set(domain, list);
  }

  const conflicts = [...grouped.entries()].filter(([, items]) => items.length > 1);

  if (conflicts.length) {
    console.error("ABORT: multiple VERIFIED canonical rows still exist for:");
    for (const [domain, items] of conflicts) {
      console.error(`- ${domain}`);
      for (const item of items) console.error(`  ${item.sourceUrl}`);
    }
    process.exit(2);
  }

  console.log(`Dorokartes Production Promoter v1`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Verified canonical domains: ${grouped.size}`);
  console.log("");

  let merchantsCreated = 0;
  let merchantsUpdated = 0;
  let cardsCreated = 0;
  let cardsUpdated = 0;
  let variantsCreated = 0;
  let sourcesCreated = 0;
  let verificationEventsCreated = 0;

  for (const [domain, [row]] of [...grouped.entries()].sort()) {
    const merchantName = resolveMerchantName(row, domain, overrides);
    const merchantSlug = slugify(merchantName);
    const cardTitle = giftCardTitle(merchantName);
    const cardSlug = `${merchantSlug}-gift-card`;
    const websiteUrl = websiteFrom(row);
    const variantType = detectVariantType(row);

    console.log(`=== ${merchantName} (${domain}) ===`);
    console.log(`Merchant slug: ${merchantSlug}`);
    console.log(`GiftCard: ${cardTitle}`);
    console.log(`Official URL: ${row.sourceUrl}`);
    console.log(
      `Variant: ${variantType ?? "UNKNOWN -> no variant auto-created"}`,
    );

    if (!APPLY) {
      console.log("");
      continue;
    }

    let merchant = await prisma.merchant.findUnique({
      where: { slug: merchantSlug },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          name: merchantName,
          slug: merchantSlug,
          websiteUrl,
          country: "GR",
          status: MerchantStatus.ACTIVE,
        },
      });
      merchantsCreated++;
    } else {
      merchant = await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          name: merchantName,
          websiteUrl,
          status: MerchantStatus.ACTIVE,
        },
      });
      merchantsUpdated++;
    }

    let giftCard = await prisma.giftCard.findUnique({
      where: { slug: cardSlug },
    });

    const verifiedAt = row.processedAt ?? new Date();

    if (!giftCard) {
      giftCard = await prisma.giftCard.create({
        data: {
          merchantId: merchant.id,
          title: cardTitle,
          slug: cardSlug,
          status: GiftCardStatus.ACTIVE,
          verificationStatus: VerificationStatus.VERIFIED,
          officialUrl: row.sourceUrl,
          lastVerifiedAt: verifiedAt,
        },
      });
      cardsCreated++;
    } else {
      giftCard = await prisma.giftCard.update({
        where: { id: giftCard.id },
        data: {
          merchantId: merchant.id,
          title: cardTitle,
          status: GiftCardStatus.ACTIVE,
          verificationStatus: VerificationStatus.VERIFIED,
          officialUrl: row.sourceUrl,
          lastVerifiedAt: verifiedAt,
        },
      });
      cardsUpdated++;
    }

    const existingMerchantSource = await prisma.sourceRecord.findFirst({
      where: {
        merchantId: merchant.id,
        giftCardId: null,
        sourceType: SourceType.OFFICIAL,
        sourceUrl: row.sourceUrl,
      },
    });

    if (!existingMerchantSource) {
      await prisma.sourceRecord.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          merchantId: merchant.id,
          rawTitle: row.title,
          firstSeenAt: row.discoveredAt,
          lastSeenAt: new Date(),
          active: true,
        },
      });
      sourcesCreated++;
    } else {
      await prisma.sourceRecord.update({
        where: { id: existingMerchantSource.id },
        data: {
          lastSeenAt: new Date(),
          active: true,
          rawTitle: row.title,
        },
      });
    }

    const existingGiftCardSource = await prisma.sourceRecord.findFirst({
      where: {
        giftCardId: giftCard.id,
        sourceType: SourceType.OFFICIAL,
        sourceUrl: row.sourceUrl,
      },
    });

    if (!existingGiftCardSource) {
      await prisma.sourceRecord.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          merchantId: merchant.id,
          giftCardId: giftCard.id,
          rawTitle: row.title,
          firstSeenAt: row.discoveredAt,
          lastSeenAt: new Date(),
          active: true,
        },
      });
      sourcesCreated++;
    } else {
      await prisma.sourceRecord.update({
        where: { id: existingGiftCardSource.id },
        data: {
          merchantId: merchant.id,
          lastSeenAt: new Date(),
          active: true,
          rawTitle: row.title,
        },
      });
    }

    if (variantType) {
      const existingVariant = await prisma.giftCardVariant.findFirst({
        where: {
          giftCardId: giftCard.id,
          type: variantType,
        },
      });

      if (!existingVariant) {
        await prisma.giftCardVariant.create({
          data: {
            giftCardId: giftCard.id,
            name: variantType === GiftCardVariantType.DIGITAL ? "Digital" : null,
            type: variantType,
            purchaseUrl: row.sourceUrl,
            active: true,
          },
        });
        variantsCreated++;
      } else {
        await prisma.giftCardVariant.update({
          where: { id: existingVariant.id },
          data: {
            purchaseUrl: row.sourceUrl,
            active: true,
          },
        });
      }
    }

    const existingPassedEvent = await prisma.verificationEvent.findFirst({
      where: {
        giftCardId: giftCard.id,
        result: VerificationResult.PASSED,
        url: row.sourceUrl,
      },
    });

    if (!existingPassedEvent) {
      await prisma.verificationEvent.create({
        data: {
          giftCardId: giftCard.id,
          result: VerificationResult.PASSED,
          url: row.sourceUrl,
          notes: `Promoted from verified canonical DiscoveryItem ${row.id}.`,
          checkedAt: verifiedAt,
        },
      });
      verificationEventsCreated++;
    }

    console.log("PROMOTED");
    console.log("");
  }

  console.log("====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Merchant groups processed: ${grouped.size}`);
  console.log(`Merchants created: ${merchantsCreated}`);
  console.log(`Merchants updated: ${merchantsUpdated}`);
  console.log(`GiftCards created: ${cardsCreated}`);
  console.log(`GiftCards updated: ${cardsUpdated}`);
  console.log(`Variants created: ${variantsCreated}`);
  console.log(`SourceRecords created: ${sourcesCreated}`);
  console.log(`VerificationEvents created: ${verificationEventsCreated}`);

  if (!APPLY) {
    console.log("");
    console.log("No production data was changed.");
    console.log("Review the dry-run output, then run with --apply.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
