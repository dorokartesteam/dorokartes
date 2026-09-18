import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = 1 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_REPORT = path.join(REPORT_DIR, "merchant-logo-browser-candidates-v1.json");
const PLAN_JSON = path.join(REPORT_DIR, "cheapet-identity-repair-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "cheapet-identity-repair-v1-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "cheapet-identity-repair-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "cheapet-identity-repair-v1-post-audit.json");

const SPECIFICATION = {
  cardId: "cmtb77u1e004pdkiy841o8nlg",
  merchantId: "cmtb77twd004odkiyt5u3ep1e",
  expectedMerchantName: "Αγοράστε μια δωροεπιταγή",
  merchantNameAfter: "CheaPet",
  expectedTitle: "Αγοράστε μια δωροεπιταγή",
  titleAfter: "CheaPet Gift Card",
  expectedOfficialUrl: "https://cheapet.gr/account/voucher",
  expectedWebsiteUrl: "https://cheapet.gr",
  expectedMerchantSlug: "αγοραστε-μια-δωροεπιταγη",
  expectedCardSlug: "αγοραστε-μια-δωροεπιταγη-αγοραστε-μια-δωροεπιταγη",
  sourceReportId: "52f4a748d9acac95ba9b3bc2cae8ae89acf9a61742c4fcc7a99b78b10544d9e0",
  logoUrl: "https://cheapet.gr/image/data/cpet-logo-new-13.png",
  logoAlt: "CheaPet-Pet shop Κατοικίδια, αγορά σκύλων, κουτάβια, τροφές.",
  evidence: [
    "The rendered official cheapet.gr header identifies the merchant as CheaPet.",
    "The same-domain header logo asset has explicit CheaPet alt text and was visually reviewed by the operator.",
    "The current merchant name and card title are generic purchase-form copy, not a merchant identity.",
    "No URL or slug is changed by this repair.",
  ],
} as const;

type BrowserCandidate = {
  url: string;
  alt: string;
  marker: string;
  width: number;
  height: number;
  score: number;
  sameOfficialDomain: boolean;
  reasons: string[];
};

type BrowserFinding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string;
  inspectedUrl: string;
  finalUrl: string | null;
  status: string;
  reasons: string[];
  candidates: BrowserCandidate[];
};

type SourceReport = {
  reportId: string;
  version: number;
  mode: string;
  findings: BrowserFinding[];
};

type Action = {
  type: "UPDATE_MERCHANT_NAME" | "UPDATE_CARD_TITLE";
  actionId: string;
  cardId: string;
  merchantId: string;
  expected: string;
  value: string;
  evidence: readonly string[];
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  sourceEvidenceFingerprint: string;
  targetFingerprint: string;
  planId: string;
  targetCount: 1;
  actionCount: 2;
  actions: Action[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function validateSource(report: SourceReport) {
  if (
    report.reportId !== SPECIFICATION.sourceReportId ||
    report.version !== 1 ||
    report.mode !== "READ_ONLY_BROWSER_PREVIEW"
  ) {
    throw new Error("Unexpected browser-evidence report.");
  }
  const finding = report.findings.find((item) => item.merchantId === SPECIFICATION.merchantId);
  const candidate = finding?.candidates.find((item) => item.url === SPECIFICATION.logoUrl);
  if (
    !finding ||
    finding.status !== "CANDIDATE" ||
    finding.merchantName !== SPECIFICATION.expectedMerchantName ||
    finding.merchantSlug !== SPECIFICATION.expectedMerchantSlug ||
    finding.websiteUrl !== SPECIFICATION.expectedWebsiteUrl ||
    finding.finalUrl !== "https://cheapet.gr/" ||
    !finding.reasons.includes("RENDERED_OFFICIAL_PAGE") ||
    !finding.reasons.includes("STRONG_HEADER_LOGO_CANDIDATE") ||
    !candidate ||
    candidate.alt !== SPECIFICATION.logoAlt ||
    !candidate.sameOfficialDomain ||
    !candidate.reasons.includes("HEADER_OR_NAV") ||
    !candidate.reasons.includes("EXPLICIT_LOGO_COMPONENT") ||
    !candidate.reasons.includes("SAME_OFFICIAL_DOMAIN")
  ) {
    throw new Error("CheaPet source-evidence precondition failed.");
  }
  return { finding, candidate };
}

async function loadTarget() {
  return prisma.giftCard.findUnique({
    where: { id: SPECIFICATION.cardId },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      updatedAt: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          logoUrl: true,
          logoSourceUrl: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });
}

function targetMaterial(target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>) {
  return {
    ...target,
    updatedAt: target.updatedAt.toISOString(),
    merchant: { ...target.merchant, updatedAt: target.merchant.updatedAt.toISOString() },
  };
}

function assertTargetPreconditions(target: Awaited<ReturnType<typeof loadTarget>>) {
  if (
    !target ||
    target.merchantId !== SPECIFICATION.merchantId ||
    target.title !== SPECIFICATION.expectedTitle ||
    target.slug !== SPECIFICATION.expectedCardSlug ||
    target.officialUrl !== SPECIFICATION.expectedOfficialUrl ||
    target.status !== "ACTIVE" ||
    target.verificationStatus !== "VERIFIED" ||
    target.merchant.id !== SPECIFICATION.merchantId ||
    target.merchant.name !== SPECIFICATION.expectedMerchantName ||
    target.merchant.slug !== SPECIFICATION.expectedMerchantSlug ||
    target.merchant.websiteUrl !== SPECIFICATION.expectedWebsiteUrl ||
    target.merchant.logoUrl !== null ||
    target.merchant.logoSourceUrl !== null ||
    target.merchant.status !== "ACTIVE"
  ) {
    throw new Error("CheaPet database precondition failed.");
  }
  return target;
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
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers: Array<keyof Action> = ["type", "actionId", "cardId", "merchantId", "expected", "value", "evidence"];
  const lines = [
    headers.join(","),
    ...actions.map((action) => headers.map((header) => csvEscape(action[header])).join(",")),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan() {
  const source = readJson<SourceReport>(SOURCE_REPORT);
  const sourceEvidence = validateSource(source);
  const target = assertTargetPreconditions(await loadTarget());
  const actions: Action[] = [
    {
      type: "UPDATE_MERCHANT_NAME",
      actionId: `update-merchant-name:${SPECIFICATION.merchantId}`,
      cardId: SPECIFICATION.cardId,
      merchantId: SPECIFICATION.merchantId,
      expected: SPECIFICATION.expectedMerchantName,
      value: SPECIFICATION.merchantNameAfter,
      evidence: SPECIFICATION.evidence,
    },
    {
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${SPECIFICATION.cardId}`,
      cardId: SPECIFICATION.cardId,
      merchantId: SPECIFICATION.merchantId,
      expected: SPECIFICATION.expectedTitle,
      value: SPECIFICATION.titleAfter,
      evidence: SPECIFICATION.evidence,
    },
  ];
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    sourceEvidenceFingerprint: stableHash(sourceEvidence),
    targetFingerprint: stableHash(targetMaterial(target)),
    targetCount: 1 as const,
    actionCount: 2 as const,
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
    path.join(REPORT_DIR, `cheapet-identity-repair-v1-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(actions);
  return plan;
}

async function applyPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const sourceEvidence = validateSource(readJson<SourceReport>(SOURCE_REPORT));
  if (stableHash(sourceEvidence) !== plan.sourceEvidenceFingerprint) {
    throw new Error("Source evidence changed after preview.");
  }
  const target = assertTargetPreconditions(await loadTarget());
  if (stableHash(targetMaterial(target)) !== plan.targetFingerprint) {
    throw new Error("CheaPet database state changed after preview.");
  }
  await prisma.$transaction(
    async (tx) => {
      const merchantResult = await tx.merchant.updateMany({
        where: { id: SPECIFICATION.merchantId, name: SPECIFICATION.expectedMerchantName },
        data: { name: SPECIFICATION.merchantNameAfter },
      });
      if (merchantResult.count !== 1) throw new Error("Merchant update precondition failed.");
      const cardResult = await tx.giftCard.updateMany({
        where: {
          id: SPECIFICATION.cardId,
          merchantId: SPECIFICATION.merchantId,
          title: SPECIFICATION.expectedTitle,
          officialUrl: SPECIFICATION.expectedOfficialUrl,
          status: "ACTIVE",
        },
        data: { title: SPECIFICATION.titleAfter },
      });
      if (cardResult.count !== 1) throw new Error("Gift-card update precondition failed.");
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    appliedActions: plan.actionCount,
    changedFields: ["Merchant.name", "GiftCard.title"],
    unchangedFields: ["Merchant.slug", "GiftCard.slug", "Merchant.websiteUrl", "GiftCard.officialUrl"],
  };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `cheapet-identity-repair-v1-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function postAudit() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const target = await loadTarget();
  const checks = {
    cardExists: Boolean(target),
    merchantName: target?.merchant.name === SPECIFICATION.merchantNameAfter,
    cardTitle: target?.title === SPECIFICATION.titleAfter,
    merchantSlugUnchanged: target?.merchant.slug === SPECIFICATION.expectedMerchantSlug,
    cardSlugUnchanged: target?.slug === SPECIFICATION.expectedCardSlug,
    websiteUrlUnchanged: target?.merchant.websiteUrl === SPECIFICATION.expectedWebsiteUrl,
    officialUrlUnchanged: target?.officialUrl === SPECIFICATION.expectedOfficialUrl,
    logoStillPending: target?.merchant.logoUrl === null && target?.merchant.logoSourceUrl === null,
  };
  const passed = Object.values(checks).every(Boolean);
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    passed,
    databaseWrites: 0,
    checks,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `cheapet-identity-repair-v1-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (!passed) throw new Error("CheaPet post-audit failed.");
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) {
    const report = await applyPlan();
    console.log("Dorokartes CheaPet Identity Repair v1 — APPLY");
    console.log(`Plan ID: ${report.planId}`);
    console.log(`Applied actions: ${report.appliedActions}`);
    return;
  }
  if (POST_AUDIT) {
    const report = await postAudit();
    console.log("Dorokartes CheaPet Identity Repair v1 — POST-AUDIT");
    console.log(`Passed: ${report.passed}`);
    return;
  }
  const plan = await buildPlan();
  console.log("Dorokartes CheaPet Identity Repair v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
