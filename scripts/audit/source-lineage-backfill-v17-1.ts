import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDomain } from "tldts";
import { SourceType } from "../../src/generated/prisma/client";
import { prisma } from "../../lib/prisma";

const VERSION = "source-lineage-backfill-v17-1" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv.find((v) => v.startsWith("--plan-id="))?.slice("--plan-id=".length) ?? null;

const REPORT_DIR = path.join(process.cwd(), "reports", "master-reconciliation-v17");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function domainOf(value: string | null | undefined) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return getDomain(host, { allowPrivateDomains: true }) ?? host;
  } catch {
    return null;
  }
}

type Action = {
  actionId: string;
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  expectedVerificationStatus: "VERIFIED";
  expectedCardStatus: "ACTIVE";
  expectedMerchantStatus: "ACTIVE";
  expectedMerchantWebsiteUrl: string;
  sourceUrl: string;
  sourceName: string;
  firstSeenAt: string;
};

async function buildPlan() {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      officialUrl: { not: null },
      merchant: { status: "ACTIVE", websiteUrl: { not: null } },
    },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      createdAt: true,
      lastVerifiedAt: true,
      merchant: {
        select: {
          name: true,
          status: true,
          websiteUrl: true,
        },
      },
      sources: {
        where: { sourceType: SourceType.OFFICIAL, active: true },
        select: { id: true, sourceUrl: true, merchantId: true, giftCardId: true },
      },
    },
  });

  const actions: Action[] = [];
  const review: any[] = [];
  let alreadyCovered = 0;

  for (const card of cards) {
    const officialUrl = card.officialUrl!;
    const merchantUrl = card.merchant.websiteUrl!;
    const cardDomain = domainOf(officialUrl);
    const merchantDomain = domainOf(merchantUrl);

    if (card.sources.length > 0) {
      alreadyCovered++;
      continue;
    }

    if (!cardDomain || !merchantDomain) {
      review.push({
        cardId: card.id,
        merchantId: card.merchantId,
        merchantName: card.merchant.name,
        title: card.title,
        officialUrl,
        merchantWebsiteUrl: merchantUrl,
        reason: "DOMAIN_PARSE_FAILED",
      });
      continue;
    }

    if (cardDomain !== merchantDomain) {
      review.push({
        cardId: card.id,
        merchantId: card.merchantId,
        merchantName: card.merchant.name,
        title: card.title,
        officialUrl,
        merchantWebsiteUrl: merchantUrl,
        cardDomain,
        merchantDomain,
        reason: "OFFICIAL_URL_DOMAIN_MISMATCH",
      });
      continue;
    }

    const base = {
      cardId: card.id,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      expectedTitle: card.title,
      expectedOfficialUrl: officialUrl,
      expectedVerificationStatus: "VERIFIED" as const,
      expectedCardStatus: "ACTIVE" as const,
      expectedMerchantStatus: "ACTIVE" as const,
      expectedMerchantWebsiteUrl: merchantUrl,
      sourceUrl: officialUrl,
      sourceName: "Verified Production Official URL",
      firstSeenAt: (card.lastVerifiedAt ?? card.createdAt).toISOString(),
    };
    actions.push({ actionId: hash(base), ...base });
  }

  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    scannedVerifiedActiveCards: cards.length,
    alreadyCovered,
    autoSafeActions: actions.length,
    reviewCount: review.length,
    actions,
    review,
  };
  const plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: hash(material),
    databaseWrites: 0,
  };
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  console.log("Dorokartes Source Lineage Backfill v17.1 — PREVIEW");
  console.log(`Verified active cards scanned: ${plan.scannedVerifiedActiveCards}`);
  console.log(`Already have active OFFICIAL source: ${plan.alreadyCovered}`);
  console.log(`AUTO_SAFE SourceRecord creates: ${plan.autoSafeActions}`);
  console.log(`Review/domain mismatch: ${plan.reviewCount}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log("PREVIEW ONLY — database unchanged.");
}

async function applyPlan() {
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const saved = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (!REQUESTED_PLAN_ID) throw new Error("Missing --plan-id=<planId>.");
  if (saved.planId !== REQUESTED_PLAN_ID) throw new Error("Requested plan ID does not match saved preview plan.");

  const fresh = await buildPlan();
  if (fresh.planId !== saved.planId) {
    throw new Error("Catalog/source state changed after PREVIEW. Re-run preview.");
  }

  let writes = 0;
  await prisma.$transaction(async (tx) => {
    for (const action of saved.actions as Action[]) {
      const card = await tx.giftCard.findFirst({
        where: {
          id: action.cardId,
          merchantId: action.merchantId,
          title: action.expectedTitle,
          officialUrl: action.expectedOfficialUrl,
          status: action.expectedCardStatus,
          verificationStatus: action.expectedVerificationStatus,
          merchant: {
            name: action.merchantName,
            status: action.expectedMerchantStatus,
            websiteUrl: action.expectedMerchantWebsiteUrl,
          },
        },
        select: { id: true },
      });
      if (!card) throw new Error(`Precondition failed for card ${action.cardId}`);

      const existing = await tx.sourceRecord.findFirst({
        where: {
          giftCardId: action.cardId,
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
        select: { id: true },
      });
      if (existing) throw new Error(`OFFICIAL SourceRecord appeared after preview for ${action.cardId}`);

      await tx.sourceRecord.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: action.sourceName,
          sourceUrl: action.sourceUrl,
          merchantId: action.merchantId,
          giftCardId: action.cardId,
          rawTitle: action.expectedTitle,
          firstSeenAt: new Date(action.firstSeenAt),
          lastSeenAt: new Date(),
          active: true,
        },
      });
      writes++;
    }
  }, { timeout: 120_000 });

  const report = {
    version: VERSION,
    mode: "APPLY",
    planId: saved.planId,
    appliedAt: new Date().toISOString(),
    databaseWrites: writes,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Dorokartes Source Lineage Backfill v17.1 — APPLY");
  console.log(`Database writes: ${writes}`);
  console.log(`JSON: ${APPLY_JSON}`);
}

async function postAudit() {
  const plan = await buildPlan();
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    remainingAutoSafe: plan.autoSafeActions,
    remainingReview: plan.reviewCount,
    alreadyCovered: plan.alreadyCovered,
    passed: plan.autoSafeActions === 0,
    databaseWrites: 0,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(POST_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Dorokartes Source Lineage Backfill v17.1 — POST-AUDIT");
  console.log(`Remaining AUTO_SAFE: ${report.remainingAutoSafe}`);
  console.log(`Remaining review: ${report.remainingReview}`);
  console.log(`Covered by OFFICIAL source: ${report.alreadyCovered}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`JSON: ${POST_JSON}`);
  console.log("POST-AUDIT ONLY — database unchanged.");
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) return applyPlan();
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
