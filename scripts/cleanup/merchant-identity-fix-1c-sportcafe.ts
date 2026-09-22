import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const APPLY = process.argv.includes("--apply");

  const KEEP_ID = "cmta1gxff007fq8iy28qeo2n2"; // root domain + canonical slug "sportcafe"
  const MERGE_ID = "cmta4yf3d000ysciy2zdlqyzw"; // localized duplicate merchant

  const EXPECTED_KEEP = {
    name: "Sportcafe",
    slug: "sportcafe",
    websiteUrl: "https://sportcafe.gr",
  };

  const EXPECTED_MERGE = {
    name: "SportCafe",
    slug: "ηλεκτρονικη-δωροκαρτα-sportcafe",
    websiteUrl: "https://el.sportcafe.gr",
  };

  const [keep, merge] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: KEEP_ID },
      include: {
        giftCards: { select: { id: true, title: true, slug: true, officialUrl: true, status: true } },
        locations: { select: { id: true, normalizedKey: true, label: true, city: true, addressLine: true } },
        sources: { select: { id: true, sourceType: true, sourceName: true, sourceUrl: true } },
        mediaAssets: { select: { id: true, url: true, isPrimary: true } },
        clicks: { select: { id: true } },
      },
    }),
    prisma.merchant.findUnique({
      where: { id: MERGE_ID },
      include: {
        giftCards: { select: { id: true, title: true, slug: true, officialUrl: true, status: true } },
        locations: { select: { id: true, normalizedKey: true, label: true, city: true, addressLine: true } },
        sources: { select: { id: true, sourceType: true, sourceName: true, sourceUrl: true } },
        mediaAssets: { select: { id: true, url: true, isPrimary: true } },
        clicks: { select: { id: true } },
      },
    }),
  ]);

  if (!keep || !merge) {
    throw new Error(`Expected SportCafe merchants not found. keep=${!!keep} merge=${!!merge}`);
  }

  const guard = (actual: string | null, expected: string | null, label: string) => {
    if (actual !== expected) {
      throw new Error(`Safety guard failed for ${label}: expected "${expected}", found "${actual}"`);
    }
  };

  guard(keep.name, EXPECTED_KEEP.name, "keep.name");
  guard(keep.slug, EXPECTED_KEEP.slug, "keep.slug");
  guard(keep.websiteUrl, EXPECTED_KEEP.websiteUrl, "keep.websiteUrl");
  guard(merge.name, EXPECTED_MERGE.name, "merge.name");
  guard(merge.slug, EXPECTED_MERGE.slug, "merge.slug");
  guard(merge.websiteUrl, EXPECTED_MERGE.websiteUrl, "merge.websiteUrl");

  const keepLocationKeys = new Set(keep.locations.map((x) => x.normalizedKey));
  const locationConflicts = merge.locations.filter((x) => keepLocationKeys.has(x.normalizedKey));

  console.log("Dorokartes Merchant Identity Fix 1C — SportCafe merge");
  console.log("======================================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log("");
  console.log(`KEEP  : ${keep.id} :: ${keep.name} :: ${keep.slug} :: ${keep.websiteUrl}`);
  console.log(`MERGE : ${merge.id} :: ${merge.name} :: ${merge.slug} :: ${merge.websiteUrl}`);
  console.log("");
  console.log("Gift cards that will belong to the canonical merchant after merge:");
  for (const c of keep.giftCards) {
    console.log(`  KEEP CARD: ${c.id} :: ${c.title} :: ${c.slug} :: ${c.officialUrl ?? "-"}`);
  }
  for (const c of merge.giftCards) {
    console.log(`  MOVE CARD: ${c.id} :: ${c.title} :: ${c.slug} :: ${c.officialUrl ?? "-"}`);
  }
  console.log("");
  console.log("Merchant-level relations to move:");
  console.log(`  Gift cards : ${merge.giftCards.length}`);
  console.log(`  Locations  : ${merge.locations.length}`);
  console.log(`  Sources    : ${merge.sources.length}`);
  console.log(`  Media      : ${merge.mediaAssets.length}`);
  console.log(`  Clicks     : ${merge.clicks.length}`);
  console.log(`  Location normalizedKey conflicts: ${locationConflicts.length}`);

  if (locationConflicts.length) {
    console.log("");
    console.log("LOCATION CONFLICTS — APPLY IS BLOCKED:");
    for (const loc of locationConflicts) {
      console.log(`  ${loc.id} :: ${loc.normalizedKey} :: ${loc.city} :: ${loc.addressLine}`);
    }
  }

  console.log("");
  console.log("Important: this step does NOT merge/delete either gift card.");
  console.log("It only consolidates both cards under one SportCafe merchant.");
  console.log("Slugs, card URLs, verification, SEO fields and card relations are unchanged.");

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database writes performed.");
    console.log("Re-run with --apply only after reviewing this plan.");
    await prisma.$disconnect();
    return;
  }

  if (locationConflicts.length) {
    throw new Error("Apply aborted: MerchantLocation normalizedKey conflicts must be resolved first.");
  }

  await prisma.$transaction(async (tx) => {
    const liveKeep = await tx.merchant.findUnique({ where: { id: KEEP_ID } });
    const liveMerge = await tx.merchant.findUnique({ where: { id: MERGE_ID } });

    if (!liveKeep || !liveMerge) throw new Error("Safety guard failed inside transaction: merchant missing.");

    guard(liveKeep.name, EXPECTED_KEEP.name, "tx keep.name");
    guard(liveKeep.slug, EXPECTED_KEEP.slug, "tx keep.slug");
    guard(liveKeep.websiteUrl, EXPECTED_KEEP.websiteUrl, "tx keep.websiteUrl");
    guard(liveMerge.name, EXPECTED_MERGE.name, "tx merge.name");
    guard(liveMerge.slug, EXPECTED_MERGE.slug, "tx merge.slug");
    guard(liveMerge.websiteUrl, EXPECTED_MERGE.websiteUrl, "tx merge.websiteUrl");

    await tx.giftCard.updateMany({
      where: { merchantId: MERGE_ID },
      data: { merchantId: KEEP_ID },
    });

    await tx.merchantLocation.updateMany({
      where: { merchantId: MERGE_ID },
      data: { merchantId: KEEP_ID },
    });

    await tx.sourceRecord.updateMany({
      where: { merchantId: MERGE_ID },
      data: { merchantId: KEEP_ID },
    });

    await tx.mediaAsset.updateMany({
      where: { merchantId: MERGE_ID },
      data: { merchantId: KEEP_ID },
    });

    await tx.outboundClick.updateMany({
      where: { merchantId: MERGE_ID },
      data: { merchantId: KEEP_ID },
    });

    const remaining = {
      cards: await tx.giftCard.count({ where: { merchantId: MERGE_ID } }),
      locations: await tx.merchantLocation.count({ where: { merchantId: MERGE_ID } }),
      sources: await tx.sourceRecord.count({ where: { merchantId: MERGE_ID } }),
      media: await tx.mediaAsset.count({ where: { merchantId: MERGE_ID } }),
      clicks: await tx.outboundClick.count({ where: { merchantId: MERGE_ID } }),
    };

    const nonZero = Object.entries(remaining).filter(([, count]) => count !== 0);
    if (nonZero.length) {
      throw new Error(`Apply aborted: relations remain on duplicate merchant: ${JSON.stringify(remaining)}`);
    }

    await tx.merchant.delete({ where: { id: MERGE_ID } });
  });

  const verify = await prisma.merchant.findUnique({
    where: { id: KEEP_ID },
    include: { giftCards: { select: { id: true, title: true, officialUrl: true } } },
  });
  const deleted = await prisma.merchant.findUnique({ where: { id: MERGE_ID } });

  if (!verify || deleted) {
    throw new Error("Post-apply verification failed.");
  }

  console.log("");
  console.log(`APPLIED: duplicate SportCafe merchant ${MERGE_ID} merged into ${KEEP_ID}.`);
  console.log(`Canonical SportCafe now owns ${verify.giftCards.length} gift card(s).`);
  console.log("No gift card was deleted.");
  console.log("No slug, URL, logo, verification or SEO field was changed.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
