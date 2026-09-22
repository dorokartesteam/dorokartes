import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SourceType, VerificationStatus } from "../../src/generated/prisma/client";
import { prisma } from "../../lib/prisma";

const VERSION = "verified-official-source-backfill-v22" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID =
  process.argv.find((v) => v.startsWith("--plan-id="))?.slice("--plan-id=".length) ?? null;

const REPORT_DIR = path.join(process.cwd(), "reports", "master-reconciliation-v17");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

const TARGETS = [
  {
    giftCardId: "cmucbsc2t0007bsiy33j50zd5",
    merchantName: "Bershka",
    expectedTitle: "Bershka Gift Card",
    expectedOfficialUrl: "https://www.bershka.com/gr/gift-card.html",
  },
  {
    giftCardId: "cmucbsbuq0005bsiy3q6f2mqt",
    merchantName: "H&M",
    expectedTitle: "H&M Gift Card",
    expectedOfficialUrl: "https://www2.hm.com/el_gr/customer-service/gift-card.html",
  },
  {
    giftCardId: "cmucbsd1d000fbsiyya0i8sun",
    merchantName: "Massimo Dutti",
    expectedTitle: "Massimo Dutti Gift Card",
    expectedOfficialUrl: "https://www.massimodutti.com/gr/gift-card/virtual",
  },
  {
    giftCardId: "cmucbsbe40001bsiyh2977d4f",
    merchantName: "Nike",
    expectedTitle: "Nike Gift Card",
    expectedOfficialUrl:
      "https://www.nike.com/gr/t/%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%B1%CF%81%CF%84%CE%B1-2F6OXBmk/GIFTCARD-8089",
  },
  {
    giftCardId: "cmucbscsb000dbsiyhe7aydnd",
    merchantName: "Oysho",
    expectedTitle: "Oysho Gift Card",
    expectedOfficialUrl: "https://www.oysho.com/gr/gift-card/physical.html",
  },
  {
    giftCardId: "cmucbscal0009bsiyjh3hgwso",
    merchantName: "Pull&Bear",
    expectedTitle: "Pull&Bear Gift Card",
    expectedOfficialUrl: "https://www.pullandbear.com/gr/en/page/services.html",
  },
  {
    giftCardId: "cmucbscjj000bbsiyqiexwdt0",
    merchantName: "Stradivarius",
    expectedTitle: "Stradivarius Gift Card",
    expectedOfficialUrl:
      "https://www.stradivarius.com/gr/en/women/clothing/gift-card-n4804",
  },
  {
    giftCardId: "cmta5nyde002454iyc6vaizw0",
    merchantName: "Thomann",
    expectedTitle: "Thomann Gift Card",
    expectedOfficialUrl: "https://www.thomann.gr/gift_voucher.html",
  },
  {
    giftCardId: "cmucbsbnf0003bsiy2wgnuttu",
    merchantName: "Zara",
    expectedTitle: "Zara Gift Card",
    expectedOfficialUrl:
      "https://www.zara.com/gr/el/%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%B1%CF%81%CF%84%CE%B1-pT9057969516.html",
  },
  {
    giftCardId: "cmucbsda2000hbsiyi2hqvozr",
    merchantName: "Zara Home",
    expectedTitle: "Zara Home Gift Card",
    expectedOfficialUrl: "https://www.zarahome.com/gr/virtual-card.html",
  },
] as const;

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function loadState() {
  const rows = [];
  for (const target of TARGETS) {
    const card = await prisma.giftCard.findUnique({
      where: { id: target.giftCardId },
      select: {
        id: true,
        title: true,
        officialUrl: true,
        status: true,
        verificationStatus: true,
        merchantId: true,
        merchant: {
          select: {
            name: true,
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
          },
        },
      },
    });

    if (!card) throw new Error(`Missing card: ${target.giftCardId}`);

    rows.push({
      target,
      current: {
        id: card.id,
        title: card.title,
        officialUrl: card.officialUrl,
        status: card.status,
        verificationStatus: card.verificationStatus,
        merchantId: card.merchantId,
        merchantName: card.merchant.name,
        merchantStatus: card.merchant.status,
        activeOfficialSourceCount: card.sources.length,
      },
    });
  }
  return rows;
}

function validateState(rows: Awaited<ReturnType<typeof loadState>>) {
  for (const row of rows) {
    const { target, current } = row;

    if (current.status !== "ACTIVE") {
      throw new Error(`${target.merchantName}: card is not ACTIVE.`);
    }
    if (current.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new Error(`${target.merchantName}: card is not VERIFIED.`);
    }
    if (current.merchantStatus !== "ACTIVE") {
      throw new Error(`${target.merchantName}: merchant is not ACTIVE.`);
    }
    if (current.merchantName !== target.merchantName) {
      throw new Error(`${target.merchantName}: merchant name changed.`);
    }
    if (current.title !== target.expectedTitle) {
      throw new Error(`${target.merchantName}: title changed.`);
    }
    if (current.officialUrl !== target.expectedOfficialUrl) {
      throw new Error(`${target.merchantName}: officialUrl changed.`);
    }
    if (current.activeOfficialSourceCount !== 0) {
      throw new Error(`${target.merchantName}: OFFICIAL source already exists.`);
    }
  }
}

async function preview() {
  const rows = await loadState();
  validateState(rows);

  const material = {
    version: VERSION,
    actions: rows.map(({ target, current }) => ({
      giftCardId: current.id,
      merchantId: current.merchantId,
      merchantName: target.merchantName,
      title: target.expectedTitle,
      sourceUrl: target.expectedOfficialUrl,
      sourceType: "OFFICIAL",
      action: "CREATE_OFFICIAL_SOURCE",
    })),
  };

  const plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(material),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2) + "\n", "utf8");

  console.log("Dorokartes Verified OFFICIAL Source Backfill v22 — PREVIEW");
  console.log(`Targets: ${plan.actions.length}`);
  console.log(`Actions: ${plan.actions.length}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log("PREVIEW ONLY — database unchanged.");
}

async function apply() {
  if (!fs.existsSync(PLAN_JSON)) {
    throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (!REQUESTED_PLAN_ID) throw new Error("Missing --plan-id=<PLAN_ID>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Plan ID mismatch.");

  const rows = await loadState();
  validateState(rows);

  const material = {
    version: VERSION,
    actions: rows.map(({ target, current }) => ({
      giftCardId: current.id,
      merchantId: current.merchantId,
      merchantName: target.merchantName,
      title: target.expectedTitle,
      sourceUrl: target.expectedOfficialUrl,
      sourceType: "OFFICIAL",
      action: "CREATE_OFFICIAL_SOURCE",
    })),
  };

  if (stableHash(material) !== plan.planId) {
    throw new Error("Target state changed after preview. Re-run preview.");
  }

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;

    for (const action of plan.actions) {
      const existing = await tx.sourceRecord.findFirst({
        where: {
          giftCardId: action.giftCardId,
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
        select: { id: true },
      });

      if (existing) {
        throw new Error(`${action.merchantName}: OFFICIAL source appeared before apply.`);
      }

      await tx.sourceRecord.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: "Verified OFFICIAL Source Backfill v22",
          sourceUrl: action.sourceUrl,
          merchantId: action.merchantId,
          giftCardId: action.giftCardId,
          rawTitle: action.title,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          active: true,
        },
      });

      count++;
    }

    return count;
  });

  const report = {
    version: VERSION,
    mode: "APPLY",
    planId: plan.planId,
    appliedAt: new Date().toISOString(),
    createdOfficialSources: created,
    changedVerificationStatuses: 0,
    changedUrls: 0,
    changedTitles: 0,
  };

  fs.writeFileSync(APPLY_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("Dorokartes Verified OFFICIAL Source Backfill v22 — APPLY");
  console.log(`OFFICIAL sources created: ${created}`);
  console.log("Verification statuses changed: 0");
  console.log("URLs changed: 0");
  console.log("Titles changed: 0");
  console.log(`JSON: ${APPLY_JSON}`);
}

async function postAudit() {
  const verifiedMissing = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.VERIFIED,
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
  });

  const pendingMissing = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.PENDING,
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
  });

  const needsReviewMissing = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.NEEDS_REVIEW,
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
  });

  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    verifiedMissingOfficialSource: verifiedMissing,
    pendingMissingOfficialSource: pendingMissing,
    needsReviewMissingOfficialSource: needsReviewMissing,
    pass: verifiedMissing === 0,
  };

  fs.writeFileSync(POST_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("Dorokartes Verified OFFICIAL Source Backfill v22 — POST AUDIT");
  console.log(`VERIFIED missing OFFICIAL source: ${verifiedMissing}`);
  console.log(`PENDING missing OFFICIAL source: ${pendingMissing}`);
  console.log(`NEEDS_REVIEW missing OFFICIAL source: ${needsReviewMissing}`);
  console.log(`PASS: ${verifiedMissing === 0}`);
  console.log(`JSON: ${POST_JSON}`);
  console.log("POST-AUDIT ONLY — database unchanged.");
}

async function main() {
  if (APPLY && POST_AUDIT) {
    throw new Error("--apply and --post-audit cannot be combined.");
  }
  if (APPLY) return apply();
  if (POST_AUDIT) return postAudit();
  return preview();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
