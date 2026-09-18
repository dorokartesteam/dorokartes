import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = 3 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv
  .find((argument) => argument.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_REPORT = path.join(
  REPORT_DIR,
  "merchant-identity-evidence-v1-2e2e891de9258127.json",
);
const PLAN_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v3-plan.json");
const APPLY_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v3-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v3-post-audit.json");

type Candidate = {
  value: string;
  score: number;
  sources: string[];
  sourceUrls: string[];
};

type Finding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string | null;
  giftCardId: string;
  giftCardTitle: string;
  officialUrl: string | null;
  status: "CANDIDATE" | "REVIEW" | "ERROR";
  reasonCodes: string[];
  candidates: Candidate[];
};

type SourceReport = {
  version: "merchant-identity-evidence-v1";
  mode: "READ_ONLY_EVIDENCE";
  reportId: string;
  findings: Finding[];
};

const SPECIFICATIONS = [
  {
    merchantId: "cmtb77srp004idkiywlcqejho",
    expectedMerchantName: "Αγοράστε μία Δωροκάρτα",
    merchantNameAfter: "BeKIDS",
    titleAfter: "BeKIDS Gift Card",
    evidenceCandidate: "BeKIDS Κατάστημα Παιδικών - Εφηβικών Ρούχων",
    minimumScore: 70,
    requiredSources: ["HOME_TITLE"],
    rationale:
      "Manual approval: the official homepage title begins with BeKIDS and the current value is voucher-form copy.",
  },
  {
    merchantId: "cmta4ywgf002ysciysp63rctm",
    expectedMerchantName: "Δωροκάρτα mybeautybox",
    merchantNameAfter: "mybeautybox",
    titleAfter: "mybeautybox Gift Card",
    evidenceCandidate: "mybeautybox",
    minimumScore: 195,
    requiredSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale:
      "Manual approval: both official pages agree on the brand without the product prefix.",
  },
  {
    merchantId: "cmtb787zh006ndkiyobzskgz8",
    expectedMerchantName: "Στείλτε μια Δωροκάρτα",
    merchantNameAfter: "MaaMonPapa",
    titleAfter: "MaaMonPapa Gift Card",
    evidenceCandidate: "MaaMonPapa.gr",
    minimumScore: 255,
    requiredSources: ["HOME_JSONLD_ORGANIZATION", "HOME_LOGO_ALT", "GIFT_LOGO_ALT"],
    rationale:
      "Manual approval: official structured data and both page logos agree; only the domain suffix is removed.",
  },
  {
    merchantId: "cmtb77a4l001udkiyprjgdlft",
    expectedMerchantName: "Christmas Gift Cards",
    merchantNameAfter: "Kinesis Gym",
    titleAfter: "Kinesis Gym Christmas Gift Card",
    evidenceCandidate: "Kinesis Gym – Γυμναστήριο Κιλκίς",
    minimumScore: 70,
    requiredSources: ["HOME_TITLE"],
    rationale:
      "Manual approval: the official homepage title names Kinesis Gym; the Christmas program remains explicit.",
  },
  {
    merchantId: "cmtb77dz2002edkiyhwhmrr7j",
    expectedMerchantName: "Massage Gift Vouchers in Chania",
    merchantNameAfter: "Nirvana Massage & Beauty Spa",
    titleAfter: "Nirvana Massage & Beauty Spa Gift Card",
    evidenceCandidate: "NIRVANA Massage & Beauty Spa",
    minimumScore: 230,
    requiredSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale:
      "Manual approval: structured organization identity agrees across homepage and gift-card page.",
  },
] as const;

type SourceEvidence = ReturnType<typeof validateSource>;
type Target = Awaited<ReturnType<typeof loadTargets>>[number];

type Action = {
  type: "UPDATE_MERCHANT_NAME" | "UPDATE_CARD_TITLE";
  actionId: string;
  merchantId: string;
  giftCardId: string;
  expected: string;
  value: string;
  evidenceCandidate: string;
  evidenceScore: number;
  evidenceSources: string[];
  evidenceUrls: string[];
  rationale: string;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  planId: string;
  targetCount: number;
  actionCount: number;
  unchangedFields: string[];
  actions: Action[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function validateSource(source: SourceReport) {
  if (
    source.version !== "merchant-identity-evidence-v1" ||
    source.mode !== "READ_ONLY_EVIDENCE" ||
    source.reportId !== "2e2e891de9258127ae03d9baf5caf30b09f5f1152bf1c4f6d4cc4fcefa529cf1"
  ) {
    throw new Error("Unexpected identity evidence report.");
  }
  return SPECIFICATIONS.map((specification) => {
    const finding = source.findings.find((item) => item.merchantId === specification.merchantId);
    const candidate = finding?.candidates.find(
      (item) => item.value === specification.evidenceCandidate,
    );
    if (
      !finding ||
      finding.status === "ERROR" ||
      finding.merchantName !== specification.expectedMerchantName ||
      !candidate ||
      candidate.score < specification.minimumScore ||
      !specification.requiredSources.every((sourceName) =>
        candidate.sources.includes(sourceName),
      ) ||
      candidate.sourceUrls.length === 0
    ) {
      throw new Error(`Evidence precondition failed for ${specification.merchantId}.`);
    }
    return { specification, finding, candidate };
  });
}

async function loadTargets() {
  return prisma.merchant.findMany({
    where: { id: { in: SPECIFICATIONS.map((item) => item.merchantId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      status: true,
      updatedAt: true,
      giftCards: {
        where: { status: "ACTIVE" },
        orderBy: { id: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          officialUrl: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });
}

function serializeTargets(targets: Target[]) {
  return targets.map((target) => ({
    ...target,
    updatedAt: target.updatedAt.toISOString(),
    giftCards: target.giftCards.map((card) => ({
      ...card,
      updatedAt: card.updatedAt.toISOString(),
    })),
  }));
}

function validateTargets(targets: Target[], evidence: SourceEvidence) {
  if (targets.length !== SPECIFICATIONS.length) {
    throw new Error(`Expected ${SPECIFICATIONS.length} merchants, found ${targets.length}.`);
  }
  for (const { specification, finding } of evidence) {
    const target = targets.find((item) => item.id === specification.merchantId);
    const card = target?.giftCards[0];
    if (
      !target ||
      target.name !== specification.expectedMerchantName ||
      target.slug !== finding.merchantSlug ||
      target.websiteUrl !== finding.websiteUrl ||
      target.status !== "ACTIVE" ||
      target.giftCards.length !== 1 ||
      !card ||
      card.id !== finding.giftCardId ||
      card.title !== finding.giftCardTitle ||
      card.slug.length === 0 ||
      card.officialUrl !== finding.officialUrl ||
      card.status !== "ACTIVE"
    ) {
      throw new Error(`Database precondition failed for ${specification.merchantId}.`);
    }
  }
  return targets;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  if (stableHash(material) !== plan.planId) throw new Error("Stored plan ID is invalid.");
  if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Apply/post-audit requires the exact preview plan ID.");
  }
}

async function preview() {
  const source = readJson<SourceReport>(SOURCE_REPORT);
  const evidence = validateSource(source);
  const targets = validateTargets(await loadTargets(), evidence);
  const actions: Action[] = evidence.flatMap(({ specification, finding, candidate }) => [
    {
      type: "UPDATE_MERCHANT_NAME",
      actionId: `update-merchant-name:${finding.merchantId}`,
      merchantId: finding.merchantId,
      giftCardId: finding.giftCardId,
      expected: finding.merchantName,
      value: specification.merchantNameAfter,
      evidenceCandidate: candidate.value,
      evidenceScore: candidate.score,
      evidenceSources: candidate.sources,
      evidenceUrls: candidate.sourceUrls,
      rationale: specification.rationale,
    },
    {
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${finding.giftCardId}`,
      merchantId: finding.merchantId,
      giftCardId: finding.giftCardId,
      expected: finding.giftCardTitle,
      value: specification.titleAfter,
      evidenceCandidate: candidate.value,
      evidenceScore: candidate.score,
      evidenceSources: candidate.sources,
      evidenceUrls: candidate.sourceUrls,
      rationale: specification.rationale,
    },
  ]);
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    sourceFingerprint: stableHash(evidence),
    targetFingerprint: stableHash(serializeTargets(targets)),
    targetCount: SPECIFICATIONS.length,
    actionCount: actions.length,
    unchangedFields: [
      "Merchant.slug",
      "Merchant.websiteUrl",
      "GiftCard.slug",
      "GiftCard.officialUrl",
    ],
    actions,
  };
  const plan: Plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(material),
  };
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-identity-repair-v3-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  return plan;
}

async function apply() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  const evidence = validateSource(readJson<SourceReport>(SOURCE_REPORT));
  if (stableHash(evidence) !== plan.sourceFingerprint) throw new Error("Source evidence changed.");
  const targets = validateTargets(await loadTargets(), evidence);
  if (stableHash(serializeTargets(targets)) !== plan.targetFingerprint) {
    throw new Error("Database state changed after preview.");
  }
  await prisma.$transaction(
    async (tx) => {
      for (const { specification, finding } of evidence) {
        const merchant = await tx.merchant.updateMany({
          where: {
            id: specification.merchantId,
            name: specification.expectedMerchantName,
            slug: finding.merchantSlug,
            websiteUrl: finding.websiteUrl,
            status: "ACTIVE",
          },
          data: { name: specification.merchantNameAfter },
        });
        if (merchant.count !== 1) throw new Error(`Merchant update failed: ${specification.merchantId}`);
        const card = await tx.giftCard.updateMany({
          where: {
            id: finding.giftCardId,
            merchantId: specification.merchantId,
            title: finding.giftCardTitle,
            officialUrl: finding.officialUrl,
            status: "ACTIVE",
          },
          data: { title: specification.titleAfter },
        });
        if (card.count !== 1) throw new Error(`Gift-card update failed: ${finding.giftCardId}`);
      }
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    targetCount: plan.targetCount,
    appliedActions: plan.actionCount,
    changedFields: ["Merchant.name", "GiftCard.title"],
    unchangedFields: plan.unchangedFields,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-identity-repair-v3-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function postAudit() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  const evidence = validateSource(readJson<SourceReport>(SOURCE_REPORT));
  const targets = await loadTargets();
  const checks = evidence.map(({ specification, finding }) => {
    const target = targets.find((item) => item.id === specification.merchantId);
    const card = target?.giftCards.find((item) => item.id === finding.giftCardId);
    const immutableUrlsAndSlugs =
      target?.slug === finding.merchantSlug &&
      target?.websiteUrl === finding.websiteUrl &&
      card?.officialUrl === finding.officialUrl;
    return {
      merchantId: specification.merchantId,
      giftCardId: finding.giftCardId,
      passed:
        target?.name === specification.merchantNameAfter &&
        target?.status === "ACTIVE" &&
        target?.giftCards.length === 1 &&
        card?.title === specification.titleAfter &&
        card?.status === "ACTIVE" &&
        immutableUrlsAndSlugs,
      immutableUrlsAndSlugs,
    };
  });
  const passed = checks.length === SPECIFICATIONS.length && checks.every((check) => check.passed);
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checkedTargets: checks.length,
    passed,
    databaseWrites: 0,
    checks,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-identity-repair-v3-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (!passed) throw new Error("Identity repair v3 post-audit failed.");
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) {
    const report = await apply();
    console.log("Dorokartes Merchant Identity Repair v3 — APPLY");
    console.log(`Plan ID: ${report.planId}`);
    console.log(`Targets: ${report.targetCount}`);
    console.log(`Applied actions: ${report.appliedActions}`);
    return;
  }
  if (POST_AUDIT) {
    const report = await postAudit();
    console.log("Dorokartes Merchant Identity Repair v3 — POST-AUDIT");
    console.log(`Checked targets: ${report.checkedTargets}`);
    console.log(`Passed: ${report.passed}`);
    return;
  }
  const plan = await preview();
  console.log("Dorokartes Merchant Identity Repair v3 — PREVIEW");
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
