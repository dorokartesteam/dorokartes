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
const SOURCE_AUDIT = path.join(REPORT_DIR, "full-catalog-cleanup-v11-active-post-audit.json");
const PLAN_JSON = path.join(REPORT_DIR, "final-identity-repair-v16-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "final-identity-repair-v16-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "final-identity-repair-v16-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "final-identity-repair-v16-post-audit.json");

type IdentitySpec = {
  cardId: string;
  merchantId: string;
  expectedMerchantName: string;
  valueMerchantName: string;
  expectedTitle: string;
  valueTitle: string;
  officialUrl: string;
  expectedVerificationStatus: "VERIFIED" | "NEEDS_REVIEW";
  sourceIssue: "THIRD_PARTY_CARD" | "UNRESOLVED_MERCHANT_NAME";
  evidence: string[];
};

type VariantSpec = {
  cardId: string;
  merchantId: string;
  expectedTitleAfter: string;
  purchaseUrl: string;
  values: string[];
  evidence: string[];
};

type Action =
  | {
      type: "UPDATE_MERCHANT_NAME";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_CARD_TITLE";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      officialUrl: string;
      evidence: string[];
    }
  | ({ type: "CREATE_VARIANT"; actionId: string } & VariantSpec);

type Plan = {
  version: 16;
  mode: "PREVIEW";
  generatedAt: string;
  sourceAuditPlanId: string;
  targetFingerprint: string;
  planId: string;
  cardCount: number;
  actionCount: number;
  actions: Action[];
};

type SourceAudit = {
  planId: string;
  scope: "NON_ARCHIVED";
  reviews: Array<{ cardId: string; issues: string[] }>;
};

const IDENTITIES: IdentitySpec[] = [
  {
    cardId: "cmta1fi60002hq8iyf9s9le0u",
    merchantId: "cmta1fhz7002gq8iyyert5tbx",
    expectedMerchantName: "Astrongameclub",
    valueMerchantName: "AstronGameClub",
    expectedTitle: "Nintendo eShop 15 EUR",
    valueTitle: "AstronGameClub Gift Card",
    officialUrl: "https://www.astrongameclub.gr/gift-card/",
    expectedVerificationStatus: "NEEDS_REVIEW",
    sourceIssue: "THIRD_PARTY_CARD",
    evidence: [
      "https://www.astrongameclub.gr/gift-card/",
      "Official structured data names the organization AstronGameClub and the product Δωροκάρτα - AstronGameClub.",
      "The current URL is the merchant's own program, not the Nintendo product page.",
    ],
  },
  {
    cardId: "cmtb78cvq007adkiylvhj4shj",
    merchantId: "cmtb78cqm0079dkiyfu94f14d",
    expectedMerchantName: "LTS GIFT CARD / ΚΑΡΤΑ ΔΩΡΟΥ",
    valueMerchantName: "Lonis Tattoo Studio",
    expectedTitle: "LTS GIFT CARD / ΚΑΡΤΑ ΔΩΡΟΥ",
    valueTitle: "Lonis Tattoo Studio Gift Card",
    officialUrl: "https://www.tattooathens.gr/blog/news/53-lts-gift-card",
    expectedVerificationStatus: "VERIFIED",
    sourceIssue: "UNRESOLVED_MERCHANT_NAME",
    evidence: [
      "https://www.tattooathens.gr/blog/news/53-lts-gift-card",
      "Official organization schema and page copy expand LTS as Lonis Tattoo Studio.",
    ],
  },
];

const VARIANT: VariantSpec = {
  cardId: "cmta1fi60002hq8iyf9s9le0u",
  merchantId: "cmta1fhz7002gq8iyyert5tbx",
  expectedTitleAfter: "AstronGameClub Gift Card",
  purchaseUrl: "https://www.astrongameclub.gr/gift-card/",
  values: ["10", "20", "25", "40", "50", "100", "120", "150", "200", "500"],
  evidence: [
    "Official product is marked virtual and requires recipient email.",
    "Official product exposes exactly €10, €20, €25, €40, €50, €100, €120, €150, €200 and €500.",
  ],
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function decimal(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

async function loadTargets() {
  const cardIds = IDENTITIES.map((item) => item.cardId);
  return prisma.giftCard.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      updatedAt: true,
      merchant: { select: { id: true, name: true, websiteUrl: true, updatedAt: true } },
      variants: {
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          purchaseUrl: true,
          values: { select: { value: true }, orderBy: { value: "asc" } },
          deliveries: { select: { method: true }, orderBy: { method: "asc" } },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
}

function targetFingerprint(cards: Awaited<ReturnType<typeof loadTargets>>) {
  return stableHash(
    cards.map((card) => ({
      ...card,
      updatedAt: card.updatedAt.toISOString(),
      merchant: { ...card.merchant, updatedAt: card.merchant.updatedAt.toISOString() },
      variants: card.variants.map((variant) => ({
        ...variant,
        minValue: decimal(variant.minValue),
        maxValue: decimal(variant.maxValue),
        values: variant.values.map((item) => decimal(item.value)),
      })),
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

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = ["type", "actionId", "cardId", "merchantId", "expected", "value", "officialUrl", "evidence"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...actions.map((action) =>
      headers
        .map((header) => {
          if (header === "expected" && action.type === "CREATE_VARIANT") return csvEscape("variants=0");
          if (header === "value" && action.type === "CREATE_VARIANT") {
            return csvEscape(`Digital EUR ${action.values.join("|")}`);
          }
          if (header === "officialUrl" && action.type === "CREATE_VARIANT") return csvEscape(action.purchaseUrl);
          return csvEscape((action as unknown as Record<string, unknown>)[header]);
        })
        .join(","),
    ),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourceAudit): Promise<Plan> {
  if (source.scope !== "NON_ARCHIVED") throw new Error("v16 requires the active-only source audit.");
  const reviewsById = new Map(source.reviews.map((review) => [review.cardId, review]));
  const cards = await loadTargets();
  if (cards.length !== IDENTITIES.length) throw new Error(`Expected ${IDENTITIES.length} cards, found ${cards.length}.`);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const spec of IDENTITIES) {
    const card = cardsById.get(spec.cardId);
    const review = reviewsById.get(spec.cardId);
    if (
      !card ||
      !review?.issues.includes(spec.sourceIssue) ||
      card.merchantId !== spec.merchantId ||
      card.merchant.name !== spec.expectedMerchantName ||
      card.title !== spec.expectedTitle ||
      card.officialUrl !== spec.officialUrl ||
      card.status !== "ACTIVE" ||
      card.verificationStatus !== spec.expectedVerificationStatus ||
      card.variants.length !== 0
    ) {
      throw new Error(`Identity precondition failed for ${spec.cardId}.`);
    }
  }
  const actions: Action[] = [
    ...IDENTITIES.map((spec) => ({
      type: "UPDATE_MERCHANT_NAME" as const,
      actionId: `update-merchant-name:${spec.merchantId}`,
      cardId: spec.cardId,
      merchantId: spec.merchantId,
      expected: spec.expectedMerchantName,
      value: spec.valueMerchantName,
      evidence: spec.evidence,
    })),
    ...IDENTITIES.map((spec) => ({
      type: "UPDATE_CARD_TITLE" as const,
      actionId: `update-card-title:${spec.cardId}`,
      cardId: spec.cardId,
      merchantId: spec.merchantId,
      expected: spec.expectedTitle,
      value: spec.valueTitle,
      officialUrl: spec.officialUrl,
      evidence: spec.evidence,
    })),
    {
      ...VARIANT,
      type: "CREATE_VARIANT" as const,
      actionId: `create-verified-variant:${VARIANT.cardId}`,
    },
  ];
  const order: Record<Action["type"], number> = {
    UPDATE_MERCHANT_NAME: 0,
    UPDATE_CARD_TITLE: 1,
    CREATE_VARIANT: 2,
  };
  actions.sort((a, b) => order[a.type] - order[b.type] || a.actionId.localeCompare(b.actionId));
  const material = {
    version: 16 as const,
    mode: "PREVIEW" as const,
    sourceAuditPlanId: source.planId,
    targetFingerprint: targetFingerprint(cards),
    cardCount: cards.length,
    actionCount: actions.length,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(planMaterial(material)) };
}

async function applyPlan(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("Apply requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored plan.");
  verifyPlan(plan);
  const cards = await loadTargets();
  if (targetFingerprint(cards) !== plan.targetFingerprint) throw new Error("Target state changed after preview.");
  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        if (action.type === "UPDATE_MERCHANT_NAME") {
          const result = await tx.merchant.updateMany({
            where: { id: action.merchantId, name: action.expected },
            data: { name: action.value },
          });
          if (result.count !== 1) throw new Error(`Merchant-name precondition failed for ${action.merchantId}.`);
          applied.push({ actionId: action.actionId, merchantId: action.merchantId, from: action.expected, to: action.value });
          continue;
        }
        if (action.type === "UPDATE_CARD_TITLE") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: action.expected,
              officialUrl: action.officialUrl,
              status: "ACTIVE",
            },
            data: { title: action.value },
          });
          if (result.count !== 1) throw new Error(`Card-title precondition failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, cardId: action.cardId, from: action.expected, to: action.value });
          continue;
        }
        const card = await tx.giftCard.findUnique({
          where: { id: action.cardId },
          select: { title: true, status: true },
        });
        const variantCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
        if (!card || card.title !== action.expectedTitleAfter || card.status !== "ACTIVE" || variantCount !== 0) {
          throw new Error(`Variant precondition failed for ${action.cardId}.`);
        }
        const created = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: "Digital",
            type: "DIGITAL",
            currency: "EUR",
            minValue: "10",
            maxValue: "500",
            customValueAllowed: false,
            purchaseUrl: action.purchaseUrl,
            values: { create: action.values.map((value) => ({ value })) },
            deliveries: { create: [{ method: "EMAIL" }] },
          },
          select: { id: true },
        });
        applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: created.id });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  const report = {
    version: 16,
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    sourceAuditPlanId: plan.sourceAuditPlanId,
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function postAudit(plan: Plan) {
  verifyPlan(plan);
  const cards = await loadTargets();
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const results = plan.actions.map((action) => {
    const card = cardsById.get(action.cardId);
    let passed = false;
    if (card && action.type === "UPDATE_MERCHANT_NAME") {
      passed = card.merchant.name === action.value;
    } else if (card && action.type === "UPDATE_CARD_TITLE") {
      passed = card.title === action.value && card.officialUrl === action.officialUrl;
    } else if (card && action.type === "CREATE_VARIANT") {
      passed = card.variants.some(
        (variant) =>
          variant.name === "Digital" &&
          variant.type === "DIGITAL" &&
          variant.currency === "EUR" &&
          decimal(variant.minValue) === "10" &&
          decimal(variant.maxValue) === "500" &&
          !variant.customValueAllowed &&
          variant.purchaseUrl === action.purchaseUrl &&
          JSON.stringify(variant.values.map((item) => decimal(item.value)).sort()) === JSON.stringify([...action.values].sort()) &&
          JSON.stringify(variant.deliveries.map((item) => item.method)) === JSON.stringify(["EMAIL"]),
      );
    }
    return { actionId: action.actionId, type: action.type, passed };
  });
  const report = {
    version: 16,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    databaseWrites: 0,
    results,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.failed) throw new Error(`Post-audit failed for ${report.failed} actions.`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<SourceAudit>(SOURCE_AUDIT);
  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    if (plan.sourceAuditPlanId !== source.planId) throw new Error("The active source audit changed after preview.");
    const report = await applyPlan(plan);
    console.log("Dorokartes Final Identity Repair v16 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    console.log(`Log: ${APPLY_LOG}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Final Identity Repair v16 — POST-AUDIT");
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
  console.log("Dorokartes Final Identity Repair v16 — PREVIEW");
  console.log(`Source audit plan: ${plan.sourceAuditPlanId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["UPDATE_MERCHANT_NAME", "UPDATE_CARD_TITLE", "CREATE_VARIANT"] as const) {
    console.log(`  ${type}: ${plan.actions.filter((action) => action.type === type).length}`);
  }
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
