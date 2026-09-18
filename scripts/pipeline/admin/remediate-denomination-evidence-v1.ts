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
const SOURCE_REPORT = path.join(REPORT_DIR, "denomination-evidence-v1-preview.json");
const PLAN_JSON = path.join(REPORT_DIR, "denomination-remediation-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "denomination-remediation-v1-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "denomination-remediation-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "denomination-remediation-v1-post-audit.json");

type Specification = {
  cardId: string;
  merchantId: string;
  expectedMerchantName: string;
  merchantNameAfter: string;
  expectedTitle: string;
  titleAfter: string;
  officialUrl: string;
  currency: "EUR";
  values: string[];
  deliveryMethods: Array<"EMAIL">;
  redemptionChannels: Array<"ONLINE" | "PHYSICAL_STORE">;
  validityMonths: number | null;
  evidence: string[];
};

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta1ftsh003nq8iyxswky70y",
    merchantId: "cmta1ftm4003mq8iyn7wu2dpi",
    expectedMerchantName: "ApparelStores",
    merchantNameAfter: "Apparel Stores",
    expectedTitle: "e-Gift Card - 30.00",
    titleAfter: "Apparel Stores Gift Card",
    officialUrl: "https://www.apparelstores.gr/products/e-gift-card",
    currency: "EUR",
    values: ["30", "50", "80", "100", "150", "200"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    evidence: [
      "Official product page identifies the offering as Apparel Stores e-Gift Card.",
      "Official selector lists €30, €50, €80, €100, €150 and €200.",
      "Official page says the e-Gift Card is sent immediately by email.",
    ],
  },
  {
    cardId: "cmta1fdz30025q8iyjgn4n03r",
    merchantId: "cmta1fdrv0024q8iy4qoe2q40",
    expectedMerchantName: "O-Biotique",
    merchantNameAfter: "O-Biotique",
    expectedTitle: "Ελεκτρονική Δωροκάρτα O-Biotique 50,00",
    titleAfter: "O-Biotique Gift Card",
    officialUrl: "https://obiotique.com/el/products/o-biotique-gift-card",
    currency: "EUR",
    values: ["10", "25", "50", "100"],
    deliveryMethods: [],
    redemptionChannels: [],
    validityMonths: null,
    evidence: [
      "Official product heading explicitly identifies an electronic O-Biotique gift card.",
      "Official denomination selector lists €10, €25, €50 and €100.",
      "Structured product data confirms the same denomination values.",
    ],
  },
  {
    cardId: "cmta4yrha002dsciywsr7shx4",
    merchantId: "cmta4yrb8002csciyx2ses6du",
    expectedMerchantName: "Leatherstudio",
    merchantNameAfter: "Leather Studio",
    expectedTitle: "Gift Card 25,00 - Leather Studio",
    titleAfter: "Leather Studio Gift Card",
    officialUrl:
      "https://www.leatherstudio.gr/el/products/copy-of-gift-card?srsltid=AfmBOoqpDrXIE_fA_yZRQ9z47-bZ1Ul0ITgf_sEZLCsb4M3B6YO5K3Xg",
    currency: "EUR",
    values: ["25"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    evidence: [
      "Official product page identifies Leather Studio Gift Card €25.",
      "Official product price and structured data both confirm €25.",
      "Official copy states that the gift card is delivered by email.",
    ],
  },
  {
    cardId: "cmta1fnrb0031q8iyg9sqt1g1",
    merchantId: "cmta1fnl10030q8iyjnfimm6o",
    expectedMerchantName: "Niyamas-Yoga",
    merchantNameAfter: "Niyamas Yoga",
    expectedTitle: "Gift Card Niyamas - Ηλεκτρονική Δωροκάρτα 20",
    titleAfter: "Niyamas Yoga Gift Card",
    officialUrl: "https://niyamas-yoga.com/product/gift-card/",
    currency: "EUR",
    values: ["20", "50", "80", "100"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
    validityMonths: 6,
    evidence: [
      "Official heading identifies an electronic Niyamas Yoga gift card.",
      "Official amount selector lists €20, €50, €80 and €100.",
      "Official copy states email delivery, online/physical-store use and six-month validity.",
    ],
  },
  {
    cardId: "cmta1jdvx00gqq8iy4767yu90",
    merchantId: "cmta1jdpf00gpq8iyjay8pz2w",
    expectedMerchantName: "Secretsofbeauty",
    merchantNameAfter: "Secrets of Beauty",
    expectedTitle: "Δωροκάρτα 300€ | Secrets of Beauty | Θεσσαλονίκη",
    titleAfter: "Secrets of Beauty Gift Card",
    officialUrl: "https://secretsofbeauty.gr/doroepitages-spa/dorokarta-300e",
    currency: "EUR",
    values: ["300"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
    validityMonths: null,
    evidence: [
      "Official product page and structured data confirm the €300 gift card.",
      "Official recipient form requires a recipient email and delivery date.",
      "Official copy explicitly permits redemption online or at the merchant premises.",
    ],
  },
];

type EvidenceFinding = {
  cardId: string;
  merchantId: string;
  status: string;
  officialUrl: string;
  finalUrl: string | null;
  priceEvidence: Array<{ value: number; currency: string | null; source: string }>;
  explicitDigitalEvidence: string | null;
};

type EvidenceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: EvidenceFinding[];
};

type Action =
  | {
      type: "UPDATE_MERCHANT_NAME";
      actionId: string;
      merchantId: string;
      cardId: string;
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
  | {
      type: "CREATE_VARIANT";
      actionId: string;
      cardId: string;
      merchantId: string;
      expectedTitleAfter: string;
      purchaseUrl: string;
      currency: "EUR";
      values: string[];
      deliveryMethods: Array<"EMAIL">;
      redemptionChannels: Array<"ONLINE" | "PHYSICAL_STORE">;
      validityMonths: number | null;
      evidence: string[];
    };

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  targetFingerprint: string;
  planId: string;
  cardCount: number;
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

function decimal(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

async function loadTargets() {
  return prisma.giftCard.findMany({
    where: { id: { in: SPECIFICATIONS.map((specification) => specification.cardId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      status: true,
      merchant: { select: { name: true } },
      variants: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          purchaseUrl: true,
          validityMonths: true,
          values: { orderBy: { value: "asc" }, select: { value: true } },
          deliveries: { orderBy: { method: "asc" }, select: { method: true } },
          redemptions: { orderBy: { channel: "asc" }, select: { channel: true } },
        },
      },
    },
  });
}

function fingerprint(cards: Awaited<ReturnType<typeof loadTargets>>) {
  return stableHash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      title: card.title,
      officialUrl: card.officialUrl,
      status: card.status,
      variants: card.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        type: variant.type,
        currency: variant.currency,
        minValue: decimal(variant.minValue),
        maxValue: decimal(variant.maxValue),
        customValueAllowed: variant.customValueAllowed,
        purchaseUrl: variant.purchaseUrl,
        validityMonths: variant.validityMonths,
        values: variant.values.map((item) => decimal(item.value)),
        deliveries: variant.deliveries.map((item) => item.method),
        redemptions: variant.redemptions.map((item) => item.channel),
      })),
    })),
  );
}

function assertEvidence(source: EvidenceReport, specifications: Specification[]) {
  for (const specification of specifications) {
    const finding = source.findings.find((item) => item.cardId === specification.cardId);
    if (
      !finding ||
      finding.merchantId !== specification.merchantId ||
      finding.status !== "SAFE_VALUE_EVIDENCE" ||
      finding.officialUrl !== specification.officialUrl ||
      finding.finalUrl !== specification.officialUrl ||
      !finding.explicitDigitalEvidence
    ) {
      throw new Error(`Live evidence precondition failed for ${specification.cardId}.`);
    }
    const evidenced = new Set(
      finding.priceEvidence
        .filter((item) => !item.currency || item.currency === specification.currency)
        .map((item) => String(item.value)),
    );
    const missing = specification.values.filter((value) => !evidenced.has(String(Number(value))));
    if (missing.length) {
      throw new Error(`Missing structured price evidence for ${specification.cardId}: ${missing.join(", ")}`);
    }
  }
}

function specificationComplete(
  card: Awaited<ReturnType<typeof loadTargets>>[number],
  specification: Specification,
) {
  const expectedValues = specification.values.map(Number).sort((a, b) => a - b);
  const variant = card.variants.find(
    (item) =>
      item.name === "Digital" &&
      item.type === "DIGITAL" &&
      item.currency === specification.currency &&
      item.purchaseUrl === specification.officialUrl,
  );
  const actualValues = variant?.values.map((item) => Number(String(item.value))).sort((a, b) => a - b) || [];
  const deliveries = variant?.deliveries.map((item) => item.method).sort() || [];
  const redemptions = variant?.redemptions.map((item) => item.channel).sort() || [];
  return Boolean(
    card.merchant.name === specification.merchantNameAfter &&
      card.title === specification.titleAfter &&
      card.officialUrl === specification.officialUrl &&
      variant &&
      decimal(variant.minValue) === String(Math.min(...expectedValues)) &&
      decimal(variant.maxValue) === String(Math.max(...expectedValues)) &&
      !variant.customValueAllowed &&
      variant.validityMonths === specification.validityMonths &&
      JSON.stringify(actualValues) === JSON.stringify(expectedValues) &&
      JSON.stringify(deliveries) === JSON.stringify([...specification.deliveryMethods].sort()) &&
      JSON.stringify(redemptions) === JSON.stringify([...specification.redemptionChannels].sort()),
  );
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = ["type", "actionId", "cardId", "merchantId", "expected", "value", "officialUrl", "currency", "values", "deliveryMethods", "evidence"];
  const lines = [
    headers.join(","),
    ...actions.map((action) => {
      const row: Record<string, unknown> = { ...action };
      return headers.map((header) => csvEscape(row[header])).join(",");
    }),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: EvidenceReport): Promise<Plan> {
  const cards = await loadTargets();
  if (cards.length !== SPECIFICATIONS.length) throw new Error("A denomination target card is missing.");
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pendingSpecifications = SPECIFICATIONS.filter((specification) => {
    const card = byId.get(specification.cardId);
    return !card || !specificationComplete(card, specification);
  });
  assertEvidence(source, pendingSpecifications);
  for (const specification of pendingSpecifications) {
    const card = byId.get(specification.cardId);
    if (
      !card ||
      card.merchantId !== specification.merchantId ||
      card.merchant.name !== specification.expectedMerchantName ||
      card.title !== specification.expectedTitle ||
      card.officialUrl !== specification.officialUrl ||
      card.status !== "ACTIVE" ||
      card.variants.length !== 0
    ) {
      throw new Error(`Catalog precondition failed for ${specification.cardId}.`);
    }
  }
  const actions: Action[] = [];
  for (const specification of pendingSpecifications) {
    if (specification.expectedMerchantName !== specification.merchantNameAfter) {
      actions.push({
        type: "UPDATE_MERCHANT_NAME",
        actionId: `update-merchant-name:${specification.merchantId}`,
        merchantId: specification.merchantId,
        cardId: specification.cardId,
        expected: specification.expectedMerchantName,
        value: specification.merchantNameAfter,
        evidence: specification.evidence,
      });
    }
    actions.push({
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expected: specification.expectedTitle,
      value: specification.titleAfter,
      officialUrl: specification.officialUrl,
      evidence: specification.evidence,
    });
    actions.push({
      type: "CREATE_VARIANT",
      actionId: `create-digital-variant:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expectedTitleAfter: specification.titleAfter,
      purchaseUrl: specification.officialUrl,
      currency: specification.currency,
      values: specification.values,
      deliveryMethods: specification.deliveryMethods,
      redemptionChannels: specification.redemptionChannels,
      validityMonths: specification.validityMonths,
      evidence: specification.evidence,
    });
  }
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    targetFingerprint: fingerprint(cards),
    cardCount: cards.length,
    actionCount: actions.length,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(material) };
}

function assertPlanRequest(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("This operation requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
}

async function applyPlan(plan: Plan) {
  assertPlanRequest(plan);
  const cards = await loadTargets();
  if (fingerprint(cards) !== plan.targetFingerprint) throw new Error("Target state changed after preview.");
  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        if (action.type === "UPDATE_MERCHANT_NAME") {
          const result = await tx.merchant.updateMany({
            where: { id: action.merchantId, name: action.expected },
            data: { name: action.value },
          });
          if (result.count !== 1) throw new Error(`Merchant precondition failed for ${action.merchantId}.`);
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
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
          if (result.count !== 1) throw new Error(`Card precondition failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
          continue;
        }
        const card = await tx.giftCard.findUnique({
          where: { id: action.cardId },
          select: { title: true, merchantId: true, status: true },
        });
        const variantCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
        if (
          !card ||
          card.title !== action.expectedTitleAfter ||
          card.merchantId !== action.merchantId ||
          card.status !== "ACTIVE" ||
          variantCount !== 0
        ) {
          throw new Error(`Variant precondition failed for ${action.cardId}.`);
        }
        const numbers = action.values.map(Number);
        const variant = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: "Digital",
            type: "DIGITAL",
            currency: action.currency,
            minValue: String(Math.min(...numbers)),
            maxValue: String(Math.max(...numbers)),
            customValueAllowed: false,
            purchaseUrl: action.purchaseUrl,
            validityMonths: action.validityMonths,
            values: { create: action.values.map((value) => ({ value })) },
            deliveries: { create: action.deliveryMethods.map((method) => ({ method })) },
            redemptions: { create: action.redemptionChannels.map((channel) => ({ channel })) },
          },
          select: { id: true },
        });
        applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: variant.id });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  const report = { version: VERSION, mode: "APPLY", appliedAt: new Date().toISOString(), planId: plan.planId, appliedCount: applied.length, applied };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function postAudit(plan: Plan) {
  assertPlanRequest(plan);
  const cards = await loadTargets();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const results = SPECIFICATIONS.map((specification) => {
    const card = byId.get(specification.cardId);
    const passed = Boolean(card && specificationComplete(card, specification));
    return { cardId: specification.cardId, merchantId: specification.merchantId, passed };
  });
  const report = {
    version: VERSION,
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
  if (report.failed) throw new Error(`Post-audit failed for ${report.failed} cards.`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<EvidenceReport>(SOURCE_REPORT);
  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    if (plan.sourceReportId !== source.reportId) throw new Error("Evidence report changed after preview.");
    const report = await applyPlan(plan);
    console.log("Dorokartes Denomination Remediation v1 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Denomination Remediation v1 — POST-AUDIT");
    console.log(`Checked cards: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  fs.writeFileSync(
    path.join(REPORT_DIR, `denomination-remediation-v1-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Denomination Remediation v1 — PREVIEW");
  console.log(`Evidence report: ${plan.sourceReportId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["UPDATE_MERCHANT_NAME", "UPDATE_CARD_TITLE", "CREATE_VARIANT"] as const) {
    console.log(`  ${type}: ${plan.actions.filter((action) => action.type === type).length}`);
  }
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
