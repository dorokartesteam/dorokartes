import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "non-program-disposition-v1";
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, "non-program-disposition-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "non-program-disposition-v1-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "non-program-disposition-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "non-program-disposition-v1-post-audit.json");
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="))?.split("=")[1];

const DISPOSITIONS = [
  {
    giftCardId: "cmta1gcgz005aq8iybkijogn9",
    expectedDomain: "cardlink.gr",
    reasonCode: "B2B_GIFT_CARD_MANAGEMENT_PLATFORM",
    evidence: "https://cardlink.gr/giftcard/",
    rationale: "Cardlink markets a gift-card management service to merchants, not a Cardlink consumer gift card.",
  },
  {
    giftCardId: "cmta1ipsc00dqq8iyvmd0xco3",
    expectedDomain: "liberal.gr",
    reasonCode: "EDITORIAL_ARTICLE_NOT_ISSUER",
    evidence: "https://liberal.gr/",
    rationale: "The record represents editorial coverage of an IKEA gift card; Liberal is not the issuer.",
  },
  {
    giftCardId: "cmta1j3ad00fiq8iyn7woqbcd",
    expectedDomain: "naftemporiki.gr",
    reasonCode: "EDITORIAL_ARTICLE_NOT_ISSUER",
    evidence: "https://naftemporiki.gr/",
    rationale: "The record represents editorial coverage of an IKEA gift card; Naftemporiki is not the issuer.",
  },
  {
    giftCardId: "cmta1m0uh00req8iycwbgvctn",
    expectedDomain: "printhouse.gr",
    reasonCode: "PRINT_SERVICE_NOT_GIFT_CARD_PROGRAM",
    evidence: "https://printhouse.gr/ektyposeis-gia-ksenodokheia/gift-voucher",
    rationale: "Printhouse sells voucher printing to businesses, not a Printhouse consumer gift-card program.",
  },
  {
    giftCardId: "cmtb77zm2005jdkiy64jdfokt",
    expectedDomain: "blue-print.gr",
    reasonCode: "PRINT_SERVICE_NOT_GIFT_CARD_PROGRAM",
    evidence: "https://blue-print.gr/",
    rationale: "Blue Print sells printed voucher/card products, not its own consumer gift-card program.",
  },
] as const;

type CatalogRow = Awaited<ReturnType<typeof loadRows>>[number];

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function domainFrom(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function immutableReportPath(filePath: string, hash: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${hash.slice(0, 16)}${parsed.ext}`);
}

async function loadRows() {
  return prisma.giftCard.findMany({
    where: { id: { in: DISPOSITIONS.map((item) => item.giftCardId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          status: true,
          _count: { select: { giftCards: true, sources: true, mediaAssets: true, clicks: true } },
        },
      },
      _count: {
        select: {
          variants: true,
          categories: true,
          occasions: true,
          sources: true,
          mediaAssets: true,
          clicks: true,
          verificationEvents: true,
          reviewFlags: true,
          productionVerificationSnapshots: true,
        },
      },
    },
  });
}

function snapshot(row: CatalogRow) {
  return {
    giftCardId: row.id,
    giftCardStatus: row.status,
    verificationStatus: row.verificationStatus,
    merchantId: row.merchant.id,
    merchantStatus: row.merchant.status,
    giftCardRelationCounts: row._count,
    merchantRelationCounts: row.merchant._count,
  };
}

function assertSafeToArchive(row: CatalogRow, expectedDomain: string) {
  const actualDomain = domainFrom(row.merchant.websiteUrl || row.officialUrl);
  if (actualDomain !== expectedDomain) {
    throw new Error(`Domain mismatch for ${row.id}: expected ${expectedDomain}, found ${actualDomain || "none"}.`);
  }
  if (row.status === "ARCHIVED" || row.merchant.status === "ARCHIVED") {
    throw new Error(`Target ${row.id} is already archived; generate no second disposition.`);
  }
  if (row.merchant._count.giftCards !== 1) {
    throw new Error(`Merchant ${row.merchant.id} owns ${row.merchant._count.giftCards} gift cards; refusing merchant archive.`);
  }
  const giftCardDependencies = Object.values(row._count).reduce((sum, count) => sum + count, 0);
  // A harvested logo may exist on the merchant and is intentionally preserved
  // with the archived row. Sources or click history require manual review.
  const merchantDependencies = row.merchant._count.sources + row.merchant._count.clicks;
  if (giftCardDependencies !== 0 || merchantDependencies !== 0) {
    throw new Error(`Target ${row.id} has dependent catalog or audit rows; refusing automatic disposition.`);
  }
}

async function currentFingerprint() {
  const rows = await loadRows();
  return stableHash(rows.map(snapshot));
}

async function buildPlan() {
  const rows = await loadRows();
  if (rows.length !== DISPOSITIONS.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = DISPOSITIONS.filter((item) => !found.has(item.giftCardId)).map((item) => item.giftCardId);
    throw new Error(`Disposition targets missing: ${missing.join(", ")}`);
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const actions = DISPOSITIONS.map((disposition) => {
    const row = rowsById.get(disposition.giftCardId)!;
    assertSafeToArchive(row, disposition.expectedDomain);
    return {
      ...disposition,
      merchantId: row.merchant.id,
      merchantName: row.merchant.name,
      merchantSlug: row.merchant.slug,
      giftCardTitle: row.title,
      giftCardSlug: row.slug,
      before: snapshot(row),
      after: {
        giftCardStatus: "ARCHIVED",
        verificationStatus: "REJECTED",
        merchantStatus: "ARCHIVED",
      },
      actionId: stableHash([disposition, snapshot(row)]),
    };
  });

  const planWithoutId = {
    version: VERSION,
    mode: "PREVIEW" as const,
    generatedAt: new Date().toISOString(),
    targetFingerprint: stableHash(rows.map(snapshot)),
    summary: { archiveGiftCards: actions.length, archiveMerchants: actions.length },
    actions,
  };
  return { ...planWithoutId, planId: stableHash(planWithoutId) };
}

function readPlan() {
  if (!PLAN_ID_ARG) throw new Error("Missing --plan-id=<id>.");
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (plan.version !== VERSION) throw new Error(`Unsupported plan version: ${plan.version}`);
  if (plan.planId !== PLAN_ID_ARG) throw new Error("Plan ID does not match the saved preview.");
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  const rows = [
    ["giftCardId", "merchantId", "merchantName", "giftCardTitle", "domain", "reasonCode", "evidence", "rationale", "giftCardAfter", "verificationAfter", "merchantAfter", "actionId"],
    ...plan.actions.map((action) => [action.giftCardId, action.merchantId, action.merchantName, action.giftCardTitle, action.expectedDomain, action.reasonCode, action.evidence, action.rationale, action.after.giftCardStatus, action.after.verificationStatus, action.after.merchantStatus, action.actionId]),
  ];
  fs.writeFileSync(PLAN_CSV, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  fs.copyFileSync(PLAN_JSON, immutableReportPath(PLAN_JSON, plan.planId));
  fs.copyFileSync(PLAN_CSV, immutableReportPath(PLAN_CSV, plan.planId));
  console.log("Dorokartes Non-program Disposition v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Gift cards to archive: ${plan.summary.archiveGiftCards}`);
  console.log(`Merchants to archive: ${plan.summary.archiveMerchants}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function apply() {
  const plan = readPlan();
  if (await currentFingerprint() !== plan.targetFingerprint) {
    throw new Error("Catalog state changed after preview. Generate and inspect a new plan.");
  }

  await prisma.$transaction(async (tx) => {
    for (const action of plan.actions) {
      const card = await tx.giftCard.updateMany({
        where: {
          id: action.giftCardId,
          status: action.before.giftCardStatus,
          verificationStatus: action.before.verificationStatus,
          merchantId: action.merchantId,
        },
        data: { status: "ARCHIVED", verificationStatus: "REJECTED" },
      });
      if (card.count !== 1) throw new Error(`Gift-card precondition failed for ${action.giftCardId}.`);

      const merchant = await tx.merchant.updateMany({
        where: { id: action.merchantId, status: action.before.merchantStatus },
        data: { status: "ARCHIVED" },
      });
      if (merchant.count !== 1) throw new Error(`Merchant precondition failed for ${action.merchantId}.`);
    }
  }, { maxWait: 15_000, timeout: 60_000 });

  const report = {
    version: VERSION,
    mode: "APPLY",
    planId: plan.planId,
    appliedAt: new Date().toISOString(),
    archivedGiftCards: plan.actions.length,
    archivedMerchants: plan.actions.length,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(APPLY_JSON, immutableReportPath(APPLY_JSON, stableHash(report)));
  console.log("Dorokartes Non-program Disposition v1 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Archived gift cards: ${report.archivedGiftCards}`);
  console.log(`Archived merchants: ${report.archivedMerchants}`);
}

async function postAudit() {
  const plan = readPlan();
  if (!fs.existsSync(APPLY_JSON)) throw new Error(`Missing successful apply report: ${APPLY_JSON}`);
  const applyReport = JSON.parse(fs.readFileSync(APPLY_JSON, "utf8"));
  if (applyReport.planId !== plan.planId || applyReport.archivedGiftCards !== plan.actions.length) {
    throw new Error("Successful apply report does not match the requested preview plan.");
  }

  const cards = await prisma.giftCard.findMany({
    where: { id: { in: plan.actions.map((action: { giftCardId: string }) => action.giftCardId) } },
    select: { id: true, status: true, verificationStatus: true, merchant: { select: { status: true } } },
  });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const failed = plan.actions.filter((action: { giftCardId: string }) => {
    const card = byId.get(action.giftCardId);
    return !card || card.status !== "ARCHIVED" || card.verificationStatus !== "REJECTED" || card.merchant.status !== "ARCHIVED";
  });
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    planId: plan.planId,
    auditedAt: new Date().toISOString(),
    checked: plan.actions.length,
    passed: plan.actions.length - failed.length,
    failed: failed.map((action: { actionId: string }) => action.actionId),
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(POST_AUDIT_JSON, immutableReportPath(POST_AUDIT_JSON, stableHash(report)));
  console.log("Dorokartes Non-program Disposition v1 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  try {
    if (APPLY) await apply();
    else if (POST_AUDIT) await postAudit();
    else await preview();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
