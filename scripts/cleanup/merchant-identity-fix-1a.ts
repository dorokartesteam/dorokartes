import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

type Fix = {
  merchantId: string;
  expectedMerchantName: string;
  newMerchantName: string;
  giftCardId: string;
  expectedGiftCardTitle: string;
  newGiftCardTitle: string;
  evidence: string;
};

const FIXES: Fix[] = [
  {
    merchantId: "cmta5nz1h002754iyxbfujt5i",
    expectedMerchantName: "Archives - Two And A Half - twoandahalf.gr",
    newMerchantName: "Two And A Half",
    giftCardId: "cmta5nz6o002854iydldfcozj",
    expectedGiftCardTitle: "Gift Card Archives - Two And A Half - twoandahalf.gr",
    newGiftCardTitle: "Two And A Half Gift Card",
    evidence: "https://www.twoandahalf.gr/",
  },
  {
    merchantId: "cmta5nul9001k54iy3hr1m5se",
    expectedMerchantName: "Αισθητικής | Naloo Beauty Bar – Ιδανικό Δώρο",
    newMerchantName: "Naloo Beauty Bar",
    giftCardId: "cmta5nupu001l54iyijhwtd67",
    expectedGiftCardTitle: "Gift Cards Αισθητικής | Naloo Beauty Bar – Ιδανικό Δώρο",
    newGiftCardTitle: "Naloo Beauty Bar Gift Card",
    evidence: "https://naloobeautybar.gr/",
  },
  {
    merchantId: "cmta5nt2i001c54iybiq2d4h8",
    expectedMerchantName: "Αρώματος | Mine Perfume Lab",
    newMerchantName: "Mine Perfume Lab",
    giftCardId: "cmta5nt82001d54iysnv9gyou",
    expectedGiftCardTitle: "Gift Card Αρώματος | Mine Perfume Lab",
    newGiftCardTitle: "Mine Perfume Lab Gift Card",
    evidence: "https://mineperfumelab.gr/",
  },
  {
    merchantId: "cmtb6utaw00293giyc40zz7r9",
    expectedMerchantName: "www.katoflitavern.gr",
    newMerchantName: "Katofli Tavern",
    giftCardId: "cmtb6utf2002a3giysyv46e18",
    expectedGiftCardTitle: "Δωροκάρτα – www.katoflitavern.gr",
    newGiftCardTitle: "Katofli Tavern Gift Card",
    evidence: "https://www.katoflitavern.gr/",
  },
];

async function main() {
  console.log("Dorokartes Merchant Identity Fix 1A");
  console.log("===================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log("Scope: 4 verified merchant display names + their card titles");
  console.log("Slugs are intentionally NOT changed in this step.\n");

  const plan: Array<{
    merchantId: string;
    merchantBefore: string;
    merchantAfter: string;
    cardId: string;
    cardBefore: string;
    cardAfter: string;
    evidence: string;
  }> = [];

  for (const fix of FIXES) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: fix.merchantId },
      select: { id: true, name: true, slug: true, websiteUrl: true },
    });

    const card = await prisma.giftCard.findUnique({
      where: { id: fix.giftCardId },
      select: { id: true, merchantId: true, title: true, slug: true, officialUrl: true },
    });

    if (!merchant) throw new Error(`Merchant not found: ${fix.merchantId}`);
    if (!card) throw new Error(`Gift card not found: ${fix.giftCardId}`);
    if (card.merchantId !== merchant.id) {
      throw new Error(`Card ${card.id} no longer belongs to merchant ${merchant.id}. Aborting.`);
    }
    if (merchant.name !== fix.expectedMerchantName) {
      throw new Error(
        `Merchant ${merchant.id} changed since audit. Expected "${fix.expectedMerchantName}", found "${merchant.name}". Aborting.`
      );
    }
    if (card.title !== fix.expectedGiftCardTitle) {
      throw new Error(
        `Gift card ${card.id} changed since audit. Expected "${fix.expectedGiftCardTitle}", found "${card.title}". Aborting.`
      );
    }

    plan.push({
      merchantId: merchant.id,
      merchantBefore: merchant.name,
      merchantAfter: fix.newMerchantName,
      cardId: card.id,
      cardBefore: card.title,
      cardAfter: fix.newGiftCardTitle,
      evidence: fix.evidence,
    });
  }

  for (const row of plan) {
    console.log(`MERCHANT ${row.merchantId}`);
    console.log(`  ${row.merchantBefore} -> ${row.merchantAfter}`);
    console.log(`CARD ${row.cardId}`);
    console.log(`  ${row.cardBefore} -> ${row.cardAfter}`);
    console.log(`  evidence: ${row.evidence}\n`);
  }

  if (!APPLY) {
    console.log("PLAN ONLY. No database writes performed.");
    console.log("Re-run with --apply only after reviewing the plan above.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const fix of FIXES) {
      await tx.merchant.update({
        where: { id: fix.merchantId },
        data: { name: fix.newMerchantName },
      });

      await tx.giftCard.update({
        where: { id: fix.giftCardId },
        data: { title: fix.newGiftCardTitle },
      });
    }
  });

  console.log(`APPLIED: ${FIXES.length} merchant names and ${FIXES.length} gift-card titles updated.`);
  console.log("Slugs, URLs, verification statuses, logos, SEO fields and relations were not changed.");
}

main()
  .catch((error) => {
    console.error("\nFAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
