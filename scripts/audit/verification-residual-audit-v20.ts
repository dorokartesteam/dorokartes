import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { SourceType, VerificationStatus } from "../../src/generated/prisma/client";
import { prisma } from "../../lib/prisma";

const VERSION = "verification-residual-audit-v20" as const;
const REPORT_DIR = path.join(process.cwd(), "reports", "master-reconciliation-v17");
const SOURCE_PLAN = path.join(REPORT_DIR, "verification-enrichment-v19b-plan.json");
const OUTPUT_JSON = path.join(REPORT_DIR, `${VERSION}.json`);
const OUTPUT_CSV = path.join(REPORT_DIR, `${VERSION}.csv`);

function groupByReason(rows: any[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.reason ?? "UNKNOWN");
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  if (!fs.existsSync(SOURCE_PLAN)) {
    throw new Error(`Missing source plan: ${SOURCE_PLAN}`);
  }

  const plan = JSON.parse(fs.readFileSync(SOURCE_PLAN, "utf8"));
  const residualFromPlan = [...(plan.review ?? []), ...(plan.errors ?? [])];

  const activeNeedsReview = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.NEEDS_REVIEW,
    },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      verificationStatus: true,
      merchant: {
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          status: true,
        },
      },
      sources: {
        where: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
        select: {
          id: true,
          sourceUrl: true,
          sourceName: true,
        },
      },
    },
  });

  const planByCard = new Map(
    residualFromPlan.map((row: any) => [row.cardId, row]),
  );

  const residualRows = activeNeedsReview.map((card) => {
    const planned = planByCard.get(card.id) as any | undefined;
    return {
      giftCardId: card.id,
      merchantId: card.merchant.id,
      merchantName: card.merchant.name,
      giftCardTitle: card.title,
      officialUrl: card.officialUrl,
      websiteUrl: card.merchant.websiteUrl,
      bucket: planned?.bucket ?? "NOT_IN_V19B_RESIDUAL_PLAN",
      reason: planned?.reason ?? "NOT_IN_V19B_RESIDUAL_PLAN",
      httpStatus: planned?.httpStatus ?? null,
      finalUrl: planned?.finalUrl ?? null,
      pageTitle: planned?.pageTitle ?? null,
      h1: planned?.h1 ?? null,
      hasOfficialSource: card.sources.length > 0,
      officialSourceCount: card.sources.length,
      officialSourceUrl: card.sources[0]?.sourceUrl ?? null,
    };
  });

  const missingSource = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
    orderBy: [{ verificationStatus: "asc" }, { merchant: { name: "asc" } }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      verificationStatus: true,
      merchant: {
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          status: true,
        },
      },
    },
  });

  const missingSourceByVerificationStatus = Object.entries(
    missingSource.reduce<Record<string, number>>((acc, card) => {
      acc[card.verificationStatus] = (acc[card.verificationStatus] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([verificationStatus, count]) => ({ verificationStatus, count }))
    .sort((a, b) => b.count - a.count);

  const residualWithSource = residualRows.filter((x) => x.hasOfficialSource).length;
  const residualMissingSource = residualRows.length - residualWithSource;

  const report = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourcePlanId: plan.planId ?? null,
    activeNeedsReviewCount: activeNeedsReview.length,
    residualPlanReviewCount: (plan.review ?? []).length,
    residualPlanErrorCount: (plan.errors ?? []).length,
    residualReasonSummary: groupByReason(residualFromPlan),
    residualWithOfficialSource: residualWithSource,
    residualMissingOfficialSource: residualMissingSource,
    activeCardsMissingOfficialSourceCount: missingSource.length,
    missingSourceByVerificationStatus,
    residualRows,
    missingSourceRows: missingSource.map((card) => ({
      giftCardId: card.id,
      merchantId: card.merchant.id,
      merchantName: card.merchant.name,
      giftCardTitle: card.title,
      officialUrl: card.officialUrl,
      websiteUrl: card.merchant.websiteUrl,
      verificationStatus: card.verificationStatus,
    })),
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  const headers = [
    "bucket",
    "reason",
    "merchantName",
    "giftCardTitle",
    "officialUrl",
    "finalUrl",
    "httpStatus",
    "hasOfficialSource",
    "officialSourceCount",
    "officialSourceUrl",
  ];
  const lines = [
    headers.join(","),
    ...residualRows.map((row) =>
      headers.map((key) => csvEscape((row as any)[key])).join(","),
    ),
  ];
  fs.writeFileSync(OUTPUT_CSV, lines.join("\n") + "\n", "utf8");

  console.log("Dorokartes Verification Residual Audit v20");
  console.log("=========================================");
  console.log(`ACTIVE NEEDS_REVIEW: ${activeNeedsReview.length}`);
  console.log(`Residual REVIEW in v19b plan: ${(plan.review ?? []).length}`);
  console.log(`Residual ERROR in v19b plan: ${(plan.errors ?? []).length}`);
  console.log("");
  console.log("RESIDUAL REASONS");
  for (const row of report.residualReasonSummary) {
    console.log(`${String(row.count).padStart(3, " ")}  ${row.reason}`);
  }
  console.log("");
  console.log(`Residual WITH OFFICIAL source: ${residualWithSource}`);
  console.log(`Residual WITHOUT OFFICIAL source: ${residualMissingSource}`);
  console.log(`ALL active cards missing OFFICIAL source: ${missingSource.length}`);
  console.log("");
  console.log("MISSING OFFICIAL SOURCE BY VERIFICATION STATUS");
  for (const row of missingSourceByVerificationStatus) {
    console.log(`${String(row.count).padStart(3, " ")}  ${row.verificationStatus}`);
  }
  console.log("");
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`CSV: ${OUTPUT_CSV}`);
  console.log("READ-ONLY — database unchanged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
