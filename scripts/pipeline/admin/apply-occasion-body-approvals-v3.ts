import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "occasion-body-approvals-v3" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_PLAN = path.join(
  REPORT_DIR,
  "occasion-page-evidence-v2-plan-9e97f90003734b43.json",
);
const CATALOG_AUDIT = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

type ApprovalKind =
  | "EXPLICIT_OFFICIAL_PRODUCT_COPY"
  | "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR";

type ApprovalSpec = {
  cardId: string;
  occasionSlugs: string[];
  approvalKind: ApprovalKind;
};

const APPROVALS: ApprovalSpec[] = [
  {
    cardId: "cmta4y81w0005sciybyesa197",
    occasionSlugs: ["birthday", "wedding", "anniversary", "christmas", "thank-you", "just-because"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77ta1004ldkiysbs31g9p",
    occasionSlugs: ["birthday", "anniversary", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmta1hpnc009wq8iyllivlokf",
    occasionSlugs: ["new-baby"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmta1hq38009yq8iyiiaeil9q",
    occasionSlugs: ["birthday"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmta1mwe200uqq8iyw8gppk86",
    occasionSlugs: ["birthday", "anniversary", "christmas", "mothers-day", "fathers-day"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb62iiy000j94iy06vaeu26",
    occasionSlugs: ["birthday"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77wmk0053dkiy6y7xeut4",
    occasionSlugs: ["birthday", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmta4yluz001psciy0wjw11o5",
    occasionSlugs: ["birthday"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb62mmg001594iyc4wmnrb6",
    occasionSlugs: ["birthday", "anniversary"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77xrz0059dkiy8ihjp8lp",
    occasionSlugs: ["birthday", "thank-you"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77h85002vdkiyrade1jng",
    occasionSlugs: ["birthday", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmta1jaht00gcq8iyymttuqej",
    occasionSlugs: ["birthday"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77kk9003ddkiyhamgukvo",
    occasionSlugs: ["birthday", "thank-you", "just-because"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb77ju00039dkiy0c3cnw1w",
    occasionSlugs: ["birthday", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmtb77ni3003sdkiyl9m6uyo5",
    occasionSlugs: ["birthday", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmtb77nwo003udkiy9wf8eyjq",
    occasionSlugs: ["birthday", "christmas"],
    approvalKind: "EXPLICIT_OFFICIAL_GIFT_CARD_THEME_SELECTOR",
  },
  {
    cardId: "cmta5nziq002a54iyxymjif5e",
    occasionSlugs: ["birthday", "anniversary"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb6v4jr003y3giytfu9ztox",
    occasionSlugs: ["birthday"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
  {
    cardId: "cmtb6uukg002g3giyhpszyjx7",
    occasionSlugs: ["birthday", "anniversary", "corporate"],
    approvalKind: "EXPLICIT_OFFICIAL_PRODUCT_COPY",
  },
];

type SourceReview = {
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  officialUrl: string;
  occasionSlug: string;
  relevance: number;
  evidenceSurface: "OFFICIAL_BODY_PROXIMITY";
  evidenceSnippet: string;
  reason: "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW";
};

type SourcePlan = {
  version: "occasion-page-evidence-v2";
  mode: "PREVIEW";
  planId: string;
  sourceReportId: string;
  reviews: SourceReview[];
};

type CatalogAudit = {
  planId: string;
  scope: "NON_ARCHIVED" | "ALL";
  reviews: Array<{ cardId: string; issues: string[] }>;
};

type Action = {
  type: "CREATE_OCCASION_RELATION";
  actionId: string;
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  officialUrl: string;
  occasionId: string;
  occasionSlug: string;
  relevance: 90;
  approvalKind: ApprovalKind;
  sourceEvidenceSurface: "OFFICIAL_BODY_PROXIMITY";
  sourceEvidenceSnippet: string;
  sourceEvidenceHash: string;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  sourcePlanId: string;
  sourceFingerprint: string;
  catalogAuditPlanId: string;
  catalogAuditFingerprint: string;
  targetFingerprint: string;
  cardCount: number;
  actionCount: number;
  byOccasion: Record<string, number>;
  actions: Action[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function approvalPairs() {
  return APPROVALS.flatMap((approval) =>
    approval.occasionSlugs.map((occasionSlug) => ({
      cardId: approval.cardId,
      occasionSlug,
      approvalKind: approval.approvalKind,
    })),
  );
}

async function loadTargets() {
  return prisma.giftCard.findMany({
    where: { id: { in: APPROVALS.map((approval) => approval.cardId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      updatedAt: true,
      merchant: { select: { id: true, name: true, status: true, updatedAt: true } },
      occasions: {
        orderBy: { occasionId: "asc" },
        select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } },
      },
    },
  });
}

type Target = Awaited<ReturnType<typeof loadTargets>>[number];

function targetFingerprint(targets: Target[]) {
  return stableHash(
    targets.map((target) => ({
      ...target,
      updatedAt: target.updatedAt.toISOString(),
      merchant: { ...target.merchant, updatedAt: target.merchant.updatedAt.toISOString() },
    })),
  );
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  if (stableHash(planMaterial(material)) !== plan.planId) throw new Error("Stored plan ID is invalid.");
}

function assertPlanRequest(plan: Plan) {
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID) throw new Error("Apply/post-audit requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = [
    "type",
    "actionId",
    "giftCardId",
    "merchantName",
    "giftCardTitle",
    "occasionSlug",
    "relevance",
    "approvalKind",
    "sourceEvidenceSnippet",
    "officialUrl",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) =>
      headers
        .map((header) => csvEscape((action as unknown as Record<string, unknown>)[header]))
        .join(","),
    ),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan() {
  const source = readJson<SourcePlan>(SOURCE_PLAN);
  const audit = readJson<CatalogAudit>(CATALOG_AUDIT);
  if (
    source.version !== "occasion-page-evidence-v2" ||
    source.mode !== "PREVIEW" ||
    source.planId !== "9e97f90003734b43e3f75c840598b0665af745576e267ce32287aee01f4b916f"
  ) {
    throw new Error("Unexpected immutable occasion-page source plan.");
  }
  if (audit.scope !== "NON_ARCHIVED" || !audit.planId) {
    throw new Error("v3 requires an active-only v11 catalog audit.");
  }
  const residualIds = new Set(audit.reviews.map((review) => review.cardId));
  const pairs = approvalPairs();
  const duplicatePairs = pairs.filter(
    (pair, index) =>
      pairs.findIndex(
        (candidate) =>
          candidate.cardId === pair.cardId && candidate.occasionSlug === pair.occasionSlug,
      ) !== index,
  );
  if (duplicatePairs.length) throw new Error("Duplicate operator approval pair.");
  if (pairs.some((pair) => residualIds.has(pair.cardId))) {
    throw new Error("An operator-approved occasion target remains in v11 residual review.");
  }
  const targets = await loadTargets();
  if (targets.length !== APPROVALS.length) {
    throw new Error(`Expected ${APPROVALS.length} target cards, found ${targets.length}.`);
  }
  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const occasions = await prisma.occasion.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const actions: Action[] = [];

  for (const pair of pairs) {
    const target = targetsById.get(pair.cardId);
    const matchingReviews = source.reviews.filter(
      (review) => review.giftCardId === pair.cardId && review.occasionSlug === pair.occasionSlug,
    );
    const review = matchingReviews[0];
    const occasionId = occasionBySlug.get(pair.occasionSlug);
    if (
      !target ||
      target.status !== "ACTIVE" ||
      target.merchant.status !== "ACTIVE" ||
      matchingReviews.length !== 1 ||
      !review ||
      review.merchantId !== target.merchantId ||
      review.merchantName !== target.merchant.name ||
      review.giftCardTitle !== target.title ||
      review.officialUrl !== target.officialUrl ||
      review.evidenceSurface !== "OFFICIAL_BODY_PROXIMITY" ||
      review.reason !== "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW" ||
      !occasionId ||
      target.occasions.some((relation) => relation.occasion.slug === pair.occasionSlug)
    ) {
      throw new Error(`Operator approval precondition failed: ${pair.cardId}:${pair.occasionSlug}.`);
    }
    const material = {
      giftCardId: target.id,
      merchantId: target.merchantId,
      merchantName: target.merchant.name,
      giftCardTitle: target.title,
      officialUrl: target.officialUrl as string,
      occasionId,
      occasionSlug: pair.occasionSlug,
      relevance: 90 as const,
      approvalKind: pair.approvalKind,
      sourceEvidenceSurface: review.evidenceSurface,
      sourceEvidenceSnippet: review.evidenceSnippet,
      sourceEvidenceHash: stableHash(review),
    };
    actions.push({
      type: "CREATE_OCCASION_RELATION",
      actionId: stableHash(material),
      ...material,
    });
  }
  const byOccasion = Object.fromEntries(
    [...new Set(actions.map((action) => action.occasionSlug))]
      .sort()
      .map((slug) => [slug, actions.filter((action) => action.occasionSlug === slug).length]),
  );
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourcePlanId: source.planId,
    sourceFingerprint: stableHash(source),
    catalogAuditPlanId: audit.planId,
    catalogAuditFingerprint: stableHash(audit),
    targetFingerprint: targetFingerprint(targets),
    cardCount: targets.length,
    actionCount: actions.length,
    byOccasion,
    actions,
  };
  const plan: Plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(actions);
  console.log("Dorokartes Occasion Body Approvals v3 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Approved relations: ${plan.actionCount}`);
  console.log(`By occasion: ${JSON.stringify(plan.byOccasion)}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function applyPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const source = readJson<SourcePlan>(SOURCE_PLAN);
  const audit = readJson<CatalogAudit>(CATALOG_AUDIT);
  if (source.planId !== plan.sourcePlanId || stableHash(source) !== plan.sourceFingerprint) {
    throw new Error("Immutable occasion source changed after preview.");
  }
  if (
    audit.planId !== plan.catalogAuditPlanId ||
    stableHash(audit) !== plan.catalogAuditFingerprint
  ) {
    throw new Error("Active-only v11 audit changed after preview.");
  }
  const targets = await loadTargets();
  if (targetFingerprint(targets) !== plan.targetFingerprint) {
    throw new Error("Approved target state changed after preview.");
  }
  const result = await prisma.$transaction(
    (tx) =>
      tx.giftCardOccasion.createMany({
        data: plan.actions.map((action) => ({
          giftCardId: action.giftCardId,
          occasionId: action.occasionId,
          relevance: action.relevance,
        })),
      }),
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  if (result.count !== plan.actionCount) throw new Error("Occasion approval apply count mismatch.");
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    applied: result.count,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Occasion Body Approvals v3 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${report.applied}`);
}

async function postAudit() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const applyReport = readJson<{ planId: string; applied: number }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actionCount) {
    throw new Error("Apply report does not match the requested preview.");
  }
  const relations = await prisma.giftCardOccasion.findMany({
    where: {
      OR: plan.actions.map((action) => ({
        giftCardId: action.giftCardId,
        occasionId: action.occasionId,
      })),
    },
    select: { giftCardId: true, occasionId: true, relevance: true },
  });
  const failed = plan.actions.filter(
    (action) =>
      !relations.some(
        (relation) =>
          relation.giftCardId === action.giftCardId &&
          relation.occasionId === action.occasionId &&
          relation.relevance === action.relevance,
      ),
  );
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: plan.actionCount,
    passed: plan.actionCount - failed.length,
    failed: failed.map((action) => action.actionId),
    databaseWrites: 0,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (failed.length) throw new Error(`Post-audit failed for ${failed.length} approved relations.`);
  console.log("Dorokartes Occasion Body Approvals v3 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) await applyPlan();
  else if (POST_AUDIT) await postAudit();
  else await buildPlan();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
