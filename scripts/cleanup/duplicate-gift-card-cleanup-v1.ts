import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type SimpleDelete = {
  label: string;
  keepId: string;
  deleteId: string;
  expectedDeleteStatus: string;
  expectedDeleteVerification: string;
};

type MergeDelete = {
  label: string;
  keepId: string;
  deleteId: string;
  keepMerchantId: string;
  deleteMerchantId: string;
};

const SIMPLE_DELETES: SimpleDelete[] = [
  {
    label: "Chania Culture",
    keepId: "cmtb77tnt004ndkiyw1tey12d",
    deleteId: "cmtb7r23t0004u8iyh8gmkixy",
    expectedDeleteStatus: "ARCHIVED",
    expectedDeleteVerification: "REJECTED",
  },
  {
    label: "Kois Optics",
    keepId: "cmta1in6000deq8iyzrf26jcw",
    deleteId: "cmtb7r3ne000bu8iyhr8e822r",
    expectedDeleteStatus: "ARCHIVED",
    expectedDeleteVerification: "REJECTED",
  },
  {
    label: "Laura Ashley",
    keepId: "cmta421t70002t8iywrh9oyoy",
    deleteId: "cmta1ldih00owq8iybi4h3dxo",
    expectedDeleteStatus: "ARCHIVED",
    expectedDeleteVerification: "REJECTED",
  },
];

const MERGE_DELETES: MergeDelete[] = [
  {
    label: "SportCafe",
    keepId: "cmta1gxm7007gq8iycl9elv83",
    deleteId: "cmta4yfe1000zsciy02ejjqqf",
    keepMerchantId: "cmta1gxff007fq8iy28qeo2n2",
    deleteMerchantId: "cmta1gxff007fq8iy28qeo2n2",
  },
  {
    label: "LEGO / Storegreece",
    keepId: "cmtb7r1ep0001u8iyqwzxbtq4",
    deleteId: "cmta1jjkg00heq8iyq7zpj3cf",
    keepMerchantId: "cmtb7r18u0000u8iyfdfhu3mf",
    deleteMerchantId: "cmta1jjde00hdq8iymhdvuagw",
  },
];

const FK_TABLES = [
  ["GiftCardCategory", "giftCardId"],
  ["GiftCardLocationCapability", "giftCardId"],
  ["GiftCardOccasion", "giftCardId"],
  ["GiftCardVariant", "giftCardId"],
  ["MediaAsset", "giftCardId"],
  ["OutboundClick", "giftCardId"],
  ["ProductionReviewFlag", "giftCardId"],
  ["ProductionVerificationSnapshot", "giftCardId"],
  ["SourceRecord", "giftCardId"],
  ["VerificationEvent", "giftCardId"],
] as const;

function qi(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

async function relationCounts(prisma: any, giftCardId: string) {
  const result: Record<string, number> = {};
  for (const [table, column] of FK_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM public.${qi(table)} WHERE ${qi(column)} = $1`,
      giftCardId
    );
    result[table] = Number(rows?.[0]?.count ?? 0);
  }
  return result;
}

async function categoryIds(prisma: any, giftCardId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ categoryId: string }>>(
    `SELECT "categoryId" FROM public."GiftCardCategory" WHERE "giftCardId" = $1 ORDER BY "categoryId"`,
    giftCardId
  );
  return rows.map((r) => r.categoryId);
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const { prisma } = await import("../../lib/prisma");

  console.log("Dorokartes Duplicate Gift Card Cleanup v1");
  console.log("=========================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log("");

  for (const item of SIMPLE_DELETES) {
    const [keep, dup] = await Promise.all([
      prisma.giftCard.findUnique({ where: { id: item.keepId } }),
      prisma.giftCard.findUnique({ where: { id: item.deleteId } }),
    ]);

    if (!keep) throw new Error(`${item.label}: keep card missing`);
    if (!dup) throw new Error(`${item.label}: duplicate card missing`);

    if (dup.status !== item.expectedDeleteStatus) {
      throw new Error(`${item.label}: duplicate status changed (${dup.status})`);
    }
    if (dup.verificationStatus !== item.expectedDeleteVerification) {
      throw new Error(`${item.label}: duplicate verification changed (${dup.verificationStatus})`);
    }

    const counts = await relationCounts(prisma, item.deleteId);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total !== 0) {
      throw new Error(`${item.label}: duplicate now has ${total} relation row(s); refusing delete`);
    }

    console.log(`DELETE ${item.label}`);
    console.log(`  KEEP   ${keep.id} :: ${keep.title} :: ${keep.status}/${keep.verificationStatus}`);
    console.log(`  DELETE ${dup.id} :: ${dup.title} :: ${dup.status}/${dup.verificationStatus}`);
    console.log(`  duplicate relations: 0`);
    console.log("");
  }

  for (const item of MERGE_DELETES) {
    const [keep, dup] = await Promise.all([
      prisma.giftCard.findUnique({ where: { id: item.keepId } }),
      prisma.giftCard.findUnique({ where: { id: item.deleteId } }),
    ]);

    if (!keep) throw new Error(`${item.label}: keep card missing`);
    if (!dup) throw new Error(`${item.label}: duplicate card missing`);
    if (keep.merchantId !== item.keepMerchantId) {
      throw new Error(`${item.label}: keep merchant changed`);
    }
    if (dup.merchantId !== item.deleteMerchantId) {
      throw new Error(`${item.label}: duplicate merchant changed`);
    }

    const counts = await relationCounts(prisma, item.deleteId);
    const unsupported = Object.entries(counts).filter(
      ([table, count]) => count > 0 && !["GiftCardCategory", "OutboundClick"].includes(table)
    );
    if (unsupported.length) {
      throw new Error(
        `${item.label}: unsupported relation rows appeared: ${unsupported
          .map(([t, c]) => `${t}=${c}`)
          .join(", ")}`
      );
    }

    const keepCats = await categoryIds(prisma, item.keepId);
    const dupCats = await categoryIds(prisma, item.deleteId);

    console.log(`MERGE+DELETE ${item.label}`);
    console.log(`  KEEP   ${keep.id} :: ${keep.title} :: ${keep.officialUrl}`);
    console.log(`  DELETE ${dup.id} :: ${dup.title} :: ${dup.officialUrl}`);
    console.log(`  duplicate category ids: ${dupCats.join(", ") || "-"}`);
    console.log(`  keep category ids     : ${keepCats.join(", ") || "-"}`);
    console.log(`  outbound clicks to move: ${counts.OutboundClick}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("PLAN ONLY. Database unchanged.");
    console.log("Apply will delete 3 zero-relation archived/rejected duplicates,");
    console.log("and merge category/click relations for SportCafe + LEGO/Storegreece before deleting those duplicate cards.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx: any) => {
      for (const item of SIMPLE_DELETES) {
        const dup = await tx.giftCard.findUnique({ where: { id: item.deleteId } });
        if (!dup) throw new Error(`${item.label}: duplicate disappeared`);
        if (
          dup.status !== item.expectedDeleteStatus ||
          dup.verificationStatus !== item.expectedDeleteVerification
        ) {
          throw new Error(`${item.label}: duplicate changed since plan`);
        }

        const counts = await relationCounts(tx, item.deleteId);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total !== 0) throw new Error(`${item.label}: relation count changed since plan`);

        await tx.giftCard.delete({ where: { id: item.deleteId } });
      }

      for (const item of MERGE_DELETES) {
        const [keep, dup] = await Promise.all([
          tx.giftCard.findUnique({ where: { id: item.keepId } }),
          tx.giftCard.findUnique({ where: { id: item.deleteId } }),
        ]);
        if (!keep || !dup) throw new Error(`${item.label}: card missing inside transaction`);
        if (keep.merchantId !== item.keepMerchantId || dup.merchantId !== item.deleteMerchantId) {
          throw new Error(`${item.label}: merchant guard failed`);
        }

        const counts = await relationCounts(tx, item.deleteId);
        const unsupported = Object.entries(counts).filter(
          ([table, count]) => count > 0 && !["GiftCardCategory", "OutboundClick"].includes(table)
        );
        if (unsupported.length) {
          throw new Error(`${item.label}: unsupported relations changed since plan`);
        }

        // Merge categories without violating the composite unique relation.
        const dupCats = await categoryIds(tx, item.deleteId);
        for (const categoryId of dupCats) {
          const existing = await tx.$queryRawUnsafe<Array<{ count: number }>>(
            `SELECT COUNT(*)::int AS count
             FROM public."GiftCardCategory"
             WHERE "giftCardId" = $1 AND "categoryId" = $2`,
            item.keepId,
            categoryId
          );

          if (Number(existing?.[0]?.count ?? 0) > 0) {
            await tx.$executeRawUnsafe(
              `DELETE FROM public."GiftCardCategory"
               WHERE "giftCardId" = $1 AND "categoryId" = $2`,
              item.deleteId,
              categoryId
            );
          } else {
            await tx.$executeRawUnsafe(
              `UPDATE public."GiftCardCategory"
               SET "giftCardId" = $1
               WHERE "giftCardId" = $2 AND "categoryId" = $3`,
              item.keepId,
              item.deleteId,
              categoryId
            );
          }
        }

        // Preserve click history on the canonical card.
        await tx.$executeRawUnsafe(
          `UPDATE public."OutboundClick" SET "giftCardId" = $1 WHERE "giftCardId" = $2`,
          item.keepId,
          item.deleteId
        );

        const after = await relationCounts(tx, item.deleteId);
        const remaining = Object.values(after).reduce((a, b) => a + b, 0);
        if (remaining !== 0) {
          throw new Error(`${item.label}: ${remaining} relation row(s) remain after merge`);
        }

        await tx.giftCard.delete({ where: { id: item.deleteId } });
      }
    },
    { maxWait: 10000, timeout: 60000 }
  );

  // Post verification.
  for (const item of [...SIMPLE_DELETES, ...MERGE_DELETES]) {
    const deleted = await prisma.giftCard.findUnique({ where: { id: item.deleteId } });
    const keep = await prisma.giftCard.findUnique({ where: { id: item.keepId } });
    if (deleted) throw new Error(`Post-check failed: duplicate still exists for ${item.label}`);
    if (!keep) throw new Error(`Post-check failed: canonical card missing for ${item.label}`);
  }

  console.log("APPLIED SUCCESSFULLY.");
  console.log("Deleted duplicate cards: 5.");
  console.log("Canonical cards preserved: 5.");
  console.log("SportCafe and LEGO/Storegreece clicks/categories were preserved on canonical cards.");
  console.log("No slugs, SEO fields, verification fields, merchant records, or official URLs were modified.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
