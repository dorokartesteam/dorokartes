import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { SourceType } from "../../src/generated/prisma/client";
import { prisma } from "../../lib/prisma";

const VERSION = "verified-missing-source-audit-v21" as const;
const REPORT_DIR = path.join(process.cwd(), "reports", "master-reconciliation-v17");
const OUTPUT_JSON = path.join(REPORT_DIR, `${VERSION}.json`);
const OUTPUT_CSV = path.join(REPORT_DIR, `${VERSION}.csv`);

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
    orderBy: [
      { verificationStatus: "asc" },
      { merchant: { name: "asc" } },
      { title: "asc" },
    ],
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      verificationStatus: true,
      lastVerifiedAt: true,
      nextReviewAt: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          status: true,
        },
      },
    },
  });

  const interesting = cards.filter(
    (card) =>
      card.verificationStatus === "VERIFIED" ||
      card.verificationStatus === "PENDING",
  );

  const report = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    totalActiveMissingOfficialSource: cards.length,
    verifiedMissingOfficialSource: interesting.filter(
      (x) => x.verificationStatus === "VERIFIED",
    ).length,
    pendingMissingOfficialSource: interesting.filter(
      (x) => x.verificationStatus === "PENDING",
    ).length,
    rows: interesting,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  const headers = [
    "verificationStatus",
    "merchantName",
    "giftCardTitle",
    "giftCardId",
    "merchantId",
    "officialUrl",
    "websiteUrl",
    "lastVerifiedAt",
    "nextReviewAt",
  ];

  const lines = [
    headers.join(","),
    ...interesting.map((card) => {
      const row: Record<string, unknown> = {
        verificationStatus: card.verificationStatus,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        giftCardId: card.id,
        merchantId: card.merchant.id,
        officialUrl: card.officialUrl,
        websiteUrl: card.merchant.websiteUrl,
        lastVerifiedAt: card.lastVerifiedAt?.toISOString() ?? "",
        nextReviewAt: card.nextReviewAt?.toISOString() ?? "",
      };
      return headers.map((key) => csvEscape(row[key])).join(",");
    }),
  ];

  fs.writeFileSync(OUTPUT_CSV, lines.join("\n") + "\n", "utf8");

  console.log("Dorokartes Verified/Pending Missing Source Audit v21");
  console.log("====================================================");
  console.log(`ACTIVE missing OFFICIAL source: ${cards.length}`);
  console.log(
    `VERIFIED missing OFFICIAL source: ${report.verifiedMissingOfficialSource}`,
  );
  console.log(
    `PENDING missing OFFICIAL source: ${report.pendingMissingOfficialSource}`,
  );
  console.log("");

  for (const card of interesting) {
    console.log(
      `[${card.verificationStatus}] ${card.merchant.name} — ${card.title}`,
    );
    console.log(`  cardId: ${card.id}`);
    console.log(`  officialUrl: ${card.officialUrl ?? "(null)"}`);
    console.log(`  websiteUrl: ${card.merchant.websiteUrl ?? "(null)"}`);
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
