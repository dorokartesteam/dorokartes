import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((arg) => arg.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_AUDIT = path.join(REPORT_DIR, "v11-title-correction-audit-v12.json");
const PLAN_JSON = path.join(REPORT_DIR, "v12-title-corrections-v13-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "v12-title-corrections-v13-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "v12-title-corrections-v13-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "v12-title-corrections-v13-post-audit.json");

type SourceRow = {
  classification: "SAFE_CANONICAL" | "PRESERVE_PROGRAM_NAME" | "MANUAL_REVIEW";
  cardId: string;
  merchantId: string;
  merchantName: string;
  currentTitle: string;
  proposedTitle: string;
  oldTitle: string;
  officialUrl: string | null;
  reason: string;
};

type SourceAudit = {
  auditId: string;
  sourcePlanId: string;
  rows: SourceRow[];
};

type Action = {
  actionId: string;
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedTitle: string;
  value: string;
  originalPreV11Title: string;
  officialUrl: string | null;
  reason: string;
};

type Plan = {
  version: 13;
  mode: "PREVIEW";
  generatedAt: string;
  sourceAuditId: string;
  sourcePlanId: string;
  catalogFingerprint: string;
  planId: string;
  actionCount: number;
  actions: Action[];
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function catalogFingerprint(cards: Array<{ id: string; merchantId: string; title: string; updatedAt: Date }>) {
  return stableHash(
    cards
      .map((card) => ({
        id: card.id,
        merchantId: card.merchantId,
        title: card.title,
        updatedAt: card.updatedAt.toISOString(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return {
    version: plan.version,
    mode: plan.mode,
    sourceAuditId: plan.sourceAuditId,
    sourcePlanId: plan.sourcePlanId,
    catalogFingerprint: plan.catalogFingerprint,
    actionCount: plan.actionCount,
    actions: plan.actions,
  };
}

function verifyPlanId(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  const expected = stableHash(planMaterial(material));
  if (expected !== plan.planId) throw new Error(`Stored plan ID is invalid: ${plan.planId}`);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers: Array<keyof Action> = [
    "actionId",
    "cardId",
    "merchantId",
    "merchantName",
    "expectedTitle",
    "value",
    "originalPreV11Title",
    "officialUrl",
    "reason",
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...actions.map((action) => headers.map((header) => csvEscape(action[header])).join(",")),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function currentCards(ids: string[]) {
  return prisma.giftCard.findMany({
    where: { id: { in: ids } },
    select: { id: true, merchantId: true, title: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
}

async function buildPlan(source: SourceAudit): Promise<Plan> {
  const sourceRows = source.rows.filter((row) => row.classification === "PRESERVE_PROGRAM_NAME");
  if (!sourceRows.length) throw new Error("The source audit has no PRESERVE_PROGRAM_NAME rows.");
  const cards = await currentCards(sourceRows.map((row) => row.cardId));
  if (cards.length !== sourceRows.length) {
    throw new Error(`Expected ${sourceRows.length} current cards, found ${cards.length}.`);
  }
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const actions = sourceRows
    .map<Action>((row) => {
      const card = cardsById.get(row.cardId);
      if (!card) throw new Error(`Current card is missing: ${row.cardId}`);
      if (card.merchantId !== row.merchantId || card.title !== row.currentTitle) {
        throw new Error(`Source-audit drift for ${row.cardId}; regenerate the v12 audit.`);
      }
      if (row.currentTitle === row.proposedTitle) {
        throw new Error(`Correction would be a no-op for ${row.cardId}.`);
      }
      return {
        actionId: `preserve-program-title:${row.cardId}`,
        cardId: row.cardId,
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        expectedTitle: row.currentTitle,
        value: row.proposedTitle,
        originalPreV11Title: row.oldTitle,
        officialUrl: row.officialUrl,
        reason: row.reason,
      };
    })
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
  const material = {
    version: 13 as const,
    mode: "PREVIEW" as const,
    sourceAuditId: source.auditId,
    sourcePlanId: source.sourcePlanId,
    catalogFingerprint: catalogFingerprint(cards),
    actionCount: actions.length,
    actions,
  };
  return {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
}

async function applyPlan(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("Apply requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error(`Requested plan ID ${REQUESTED_PLAN_ID} does not match ${plan.planId}.`);
  }
  verifyPlanId(plan);
  const cards = await currentCards(plan.actions.map((action) => action.cardId));
  if (catalogFingerprint(cards) !== plan.catalogFingerprint) {
    throw new Error("One or more target cards changed after preview; regenerate the plan.");
  }

  const applied: Array<{ actionId: string; cardId: string; from: string; to: string }> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        const result = await tx.giftCard.updateMany({
          where: {
            id: action.cardId,
            merchantId: action.merchantId,
            title: action.expectedTitle,
          },
          data: { title: action.value },
        });
        if (result.count !== 1) throw new Error(`Update precondition failed for ${action.cardId}.`);
        applied.push({
          actionId: action.actionId,
          cardId: action.cardId,
          from: action.expectedTitle,
          to: action.value,
        });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  fs.writeFileSync(
    APPLY_LOG,
    `${JSON.stringify(
      {
        version: 13,
        appliedAt: new Date().toISOString(),
        planId: plan.planId,
        sourceAuditId: plan.sourceAuditId,
        appliedCount: applied.length,
        applied,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return applied;
}

async function postAudit(source: SourceAudit) {
  const rows = source.rows.filter((row) => row.classification === "PRESERVE_PROGRAM_NAME");
  const cards = await currentCards(rows.map((row) => row.cardId));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const results = rows.map((row) => {
    const current = cardsById.get(row.cardId);
    return {
      cardId: row.cardId,
      expectedTitle: row.proposedTitle,
      currentTitle: current?.title ?? null,
      passed: current?.title === row.proposedTitle,
    };
  });
  const report = {
    version: 13,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    sourceAuditId: source.auditId,
    checked: results.length,
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed).length,
    databaseWrites: 0,
    results,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.failed) throw new Error(`Post-audit failed for ${report.failed} cards.`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<SourceAudit>(SOURCE_AUDIT);

  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    if (plan.sourceAuditId !== source.auditId) throw new Error("The v12 audit changed after preview.");
    const applied = await applyPlan(plan);
    console.log("Dorokartes v13 Program-Title Corrections — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied: ${applied.length}`);
    console.log(`Log: ${APPLY_LOG}`);
    return;
  }

  if (POST_AUDIT) {
    const report = await postAudit(source);
    console.log("Dorokartes v13 Program-Title Corrections — POST-AUDIT");
    console.log(`Checked: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Report: ${POST_AUDIT_JSON}`);
    console.log("Database writes: 0");
    return;
  }

  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  console.log("Dorokartes v13 Program-Title Corrections — PREVIEW");
  console.log(`Source audit: ${plan.sourceAuditId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const action of plan.actions) console.log(`  ${action.expectedTitle} -> ${action.value}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log(`CSV:  ${PLAN_CSV}`);
  console.log("PREVIEW ONLY — database unchanged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
