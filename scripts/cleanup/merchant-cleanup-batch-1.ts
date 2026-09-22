import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Fix = {
  merchantId: string;
  expectedMerchantName: string;
  newMerchantName: string;
  cardId: string;
  expectedCardTitle: string;
  newCardTitle: string;
  evidence: string;
};

const FIXES: Fix[] = [
  {
    merchantId: "cmta5o03q002d54iyhnei1gmz",
    expectedMerchantName: "Archives - Wellness City Spa Glyfada | Exclusive Services",
    newMerchantName: "Wellness City Spa",
    cardId: "cmta5o08h002e54iylwvhwz6r",
    expectedCardTitle: "Gift card Archives - Wellness City Spa Glyfada | Exclusive Services",
    newCardTitle: "Wellness City Spa Gift Card",
    evidence: "https://wellnesscityspa.gr/",
  },
  {
    merchantId: "cmtb62fbu000294iyhass0r8j",
    expectedMerchantName: "Bags & Hats eshop | Your trusted choice since 1965",
    newMerchantName: "Bags & Hats",
    cardId: "cmtb62fh3000394iyqc1z6qea",
    expectedCardTitle: "Gift Card - Bags & Hats eshop | Your trusted choice since 1965",
    newCardTitle: "Bags & Hats Gift Card",
    evidence: "https://bagshats.gr/",
  },
  {
    merchantId: "cmta1i2rt00b1q8iy1f6azwdh",
    expectedMerchantName: "E Shop",
    newMerchantName: "e-shop.gr",
    cardId: "cmta1i3fk00b2q8iycwvf7d3a",
    expectedCardTitle: "Δωροκάρτες | Όλα τα προϊόντα : E-shop.gr",
    newCardTitle: "e-shop.gr Gift Card",
    evidence: "https://www.e-shop.gr/",
  },
  {
    merchantId: "cmtb6un7q001e3giydasdqnfc",
    expectedMerchantName: "Espressoshop.gr Νο 1 Κατάστημα πώλησης ...",
    newMerchantName: "EspressoShop",
    cardId: "cmtb6unda001f3giyh9ahgeme",
    expectedCardTitle: "Δωροκάρτα - Espressoshop.gr Νο 1 Κατάστημα πώλησης ...",
    newCardTitle: "EspressoShop Gift Card",
    evidence: "https://espressoshop.gr/",
  },
  {
    merchantId: "cmta5nxkc002054iyrperd4fx",
    expectedMerchantName: "Shine4ever.gr",
    newMerchantName: "Shine4ever",
    cardId: "cmta5nxp2002154iym24cxgfr",
    expectedCardTitle: "Gift Voucher - Shine4ever.gr",
    newCardTitle: "Shine4ever Gift Card",
    evidence: "https://shine4ever.gr/",
  },
  {
    merchantId: "cmta1f5ck0016q8iyalh0a7ty",
    expectedMerchantName: "arfie.gr",
    newMerchantName: "Arfie",
    cardId: "cmta1f5j70017q8iy3ul3t87x",
    expectedCardTitle: "Arfie Gift Card",
    newCardTitle: "Arfie Gift Card",
    evidence: "https://www.arfie.gr/",
  },
  {
    merchantId: "cmtb787mq006ldkiy4ez5pxns",
    expectedMerchantName: "luxurycandle.gr",
    newMerchantName: "Luxury Candles",
    cardId: "cmtb787rq006mdkiykrdjibgr",
    expectedCardTitle: "Gift Card - luxurycandle.gr",
    newCardTitle: "Luxury Candles Gift Card",
    evidence: "https://luxurycandles.gr/",
  },
  {
    merchantId: "cmtb62tp4002894iya2x79xoi",
    expectedMerchantName: "για Γέννηση ή Βάπτιση – TeleioPlayRoom.gr",
    newMerchantName: "TeleioPlayRoom.gr",
    cardId: "cmtb62tub002994iy1zvxngz9",
    expectedCardTitle: "Δωροκάρτα για Γέννηση ή Βάπτιση – TeleioPlayRoom.gr",
    newCardTitle: "TeleioPlayRoom.gr Gift Card",
    evidence: "https://www.teleioplayroom.gr/",
  },
];

async function main() {
  const APPLY = process.argv.includes("--apply");
  const { prisma } = await import("../../lib/prisma");

  console.log("Dorokartes Merchant Cleanup Batch 1");
  console.log("===================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log(`Scope: ${FIXES.length} verified merchant names + card titles`);
  console.log("No slugs, URLs, logos, SEO, verification, status or relations are changed.");
  console.log("");

  for (const fix of FIXES) {
    const [merchant, card] = await Promise.all([
      prisma.merchant.findUnique({ where: { id: fix.merchantId } }),
      prisma.giftCard.findUnique({ where: { id: fix.cardId } }),
    ]);

    if (!merchant) throw new Error(`Merchant not found: ${fix.merchantId}`);
    if (!card) throw new Error(`Gift card not found: ${fix.cardId}`);

    if (merchant.name !== fix.expectedMerchantName) {
      throw new Error(
        `Safety guard failed for merchant ${fix.merchantId}: expected "${fix.expectedMerchantName}", found "${merchant.name}"`
      );
    }
    if (card.title !== fix.expectedCardTitle) {
      throw new Error(
        `Safety guard failed for card ${fix.cardId}: expected "${fix.expectedCardTitle}", found "${card.title}"`
      );
    }
    if (card.merchantId !== fix.merchantId) {
      throw new Error(
        `Safety guard failed: card ${fix.cardId} is not linked to merchant ${fix.merchantId}`
      );
    }

    console.log(`MERCHANT ${fix.merchantId}`);
    console.log(`  ${fix.expectedMerchantName} -> ${fix.newMerchantName}`);
    console.log(`CARD ${fix.cardId}`);
    console.log(`  ${fix.expectedCardTitle} -> ${fix.newCardTitle}`);
    console.log(`  evidence: ${fix.evidence}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("PLAN ONLY. No database writes performed.");
    console.log("Re-run with --apply only after reviewing the plan above.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const fix of FIXES) {
      const merchant = await tx.merchant.findUnique({ where: { id: fix.merchantId } });
      const card = await tx.giftCard.findUnique({ where: { id: fix.cardId } });

      if (!merchant || !card) throw new Error(`Safety guard failed inside transaction for ${fix.merchantId}`);
      if (merchant.name !== fix.expectedMerchantName) {
        throw new Error(`Merchant changed since plan: ${fix.merchantId}`);
      }
      if (card.title !== fix.expectedCardTitle || card.merchantId !== fix.merchantId) {
        throw new Error(`Gift card changed since plan: ${fix.cardId}`);
      }

      await tx.merchant.update({
        where: { id: fix.merchantId },
        data: { name: fix.newMerchantName },
      });

      if (fix.newCardTitle !== fix.expectedCardTitle) {
        await tx.giftCard.update({
          where: { id: fix.cardId },
          data: { title: fix.newCardTitle },
        });
      }
    }
  });

  console.log(`APPLIED: ${FIXES.length} merchant names cleaned.`);
  console.log("Gift-card titles updated where needed.");
  console.log("Slugs, URLs, logos, SEO fields, verification, statuses and relations were not changed.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
