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
    merchantId: "cmtb770ps000idkiyolfowk77",
    expectedMerchantName: "Archives",
    newMerchantName: "Cicado Creative Studio",
    giftCardId: "cmtb770up000jdkiys2xgzyjl",
    expectedGiftCardTitle: "GIft Cards Archives",
    newGiftCardTitle: "Cicado Creative Studio Gift Card",
    evidence: "https://cicado.gr/en/about/",
  },
  {
    merchantId: "cmtb772qg000sdkiyy1u9nxli",
    expectedMerchantName: "Archives",
    newMerchantName: "Dido Cosmetics",
    giftCardId: "cmtb772w1000tdkiycjyct23l",
    expectedGiftCardTitle: "Δωροκάρτα Archives",
    newGiftCardTitle: "Dido Cosmetics Gift Card",
    evidence: "https://www.didocosmetics.gr/",
  },
  {
    merchantId: "cmtb776ks001cdkiyblekiezm",
    expectedMerchantName: "Archives",
    newMerchantName: "Gerochristo Jewelry",
    giftCardId: "cmtb776qx001ddkiyf0qqkxjr",
    expectedGiftCardTitle: "Gift Card Archives",
    newGiftCardTitle: "Gerochristo Jewelry Gift Card",
    evidence: "https://gerochristojewelry.gr/",
  },
  {
    merchantId: "cmtb77w4e0050dkiy7yigzns3",
    expectedMerchantName: "Αρχεία",
    newMerchantName: "ellievfashion",
    giftCardId: "cmtb77w980051dkiyc5an3okr",
    expectedGiftCardTitle: "Δωροκάρτα Αρχεία",
    newGiftCardTitle: "ellievfashion Gift Card",
    evidence: "https://www.ellievfashion.gr/",
  },
  {
    merchantId: "cmtb786u2006hdkiyonu3jl9k",
    expectedMerchantName: "Αρχεία",
    newMerchantName: "Love Lucy Boutique",
    giftCardId: "cmtb7870h006idkiywp9f3dvf",
    expectedGiftCardTitle: "Δωροκάρτα Αρχεία",
    newGiftCardTitle: "Love Lucy Boutique Gift Card",
    evidence: "https://lovelucy.gr/",
  },
  {
    merchantId: "cmtb788gu006pdkiynww25c7m",
    expectedMerchantName: "Αρχεία",
    newMerchantName: "Malle Concept",
    giftCardId: "cmtb788lp006qdkiy17zrzzhw",
    expectedGiftCardTitle: "Gift card Αρχεία",
    newGiftCardTitle: "Malle Concept Gift Card",
    evidence: "https://www.malleconcept.gr/",
  },
];

async function main() {
  console.log("Dorokartes Merchant Identity Fix 1B");
  console.log("===================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log("Scope: 6 false duplicate merchant names + their card titles");
  console.log("No merge, slug, URL, logo, SEO, verification or relation changes.\n");

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
  console.log("No merges performed. Slugs, URLs, verification statuses, logos, SEO fields and relations were not changed.");
}

main()
  .catch((error) => {
    console.error("\nFAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
