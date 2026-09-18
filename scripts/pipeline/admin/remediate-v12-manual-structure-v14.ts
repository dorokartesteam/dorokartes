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
const PLAN_JSON = path.join(REPORT_DIR, "v12-manual-structure-v14-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "v12-manual-structure-v14-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "v12-manual-structure-v14-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "v12-manual-structure-v14-post-audit.json");

type VariantType = "DIGITAL" | "DIGITAL_AND_PHYSICAL";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE" | "PHONE";
type DeliveryMethod = "EMAIL";

type VariantSpec = {
  cardId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  name: "Digital";
  variantType: VariantType;
  currency: "EUR" | "USD";
  minValue: string | null;
  maxValue: string | null;
  customValueAllowed: boolean;
  values: string[];
  validityMonths: number | null;
  deliveries: DeliveryMethod[];
  redemptions: RedemptionChannel[];
  evidence: string[];
};

type OccasionSpec = {
  cardId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  occasionSlug: "fathers-day" | "name-day" | "valentines" | "mothers-day";
  evidence: string[];
};

type UrlSpec = {
  cardId: string;
  merchantName: string;
  expectedTitle: string;
  expectedUrl: string;
  value: string;
  evidence: string[];
};

type Action =
  | ({ type: "CREATE_VARIANT"; actionId: string } & VariantSpec)
  | ({ type: "CONNECT_OCCASION"; actionId: string; occasionId: string; occasionName: string } & OccasionSpec)
  | ({ type: "UPDATE_OFFICIAL_URL"; actionId: string } & UrlSpec);

type Plan = {
  version: 14;
  mode: "PREVIEW";
  generatedAt: string;
  sourceAuditId: string;
  catalogFingerprint: string;
  planId: string;
  actionCount: number;
  cardCount: number;
  actions: Action[];
};

type SourceAudit = {
  auditId: string;
  rows: Array<{ classification: string; cardId: string }>;
};

const VARIANTS: VariantSpec[] = [
  {
    cardId: "cmta4z4qr003xsciyykm8w59d",
    merchantName: "Tailor Made Knitwear",
    expectedTitle: "Tailor Made Knitwear Gift Card",
    expectedOfficialUrl: "https://tailormadeknitwear.com.gr/product/giftcard-tailor-made-knitwear/",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "50",
    maxValue: "450",
    customValueAllowed: false,
    values: ["50", "75", "100", "150", "200", "250", "300", "350", "400", "450"],
    validityMonths: 12,
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHONE"],
    evidence: [
      "Official page identifies an electronic/e-Gift Card delivered by email.",
      "Official page lists values €50, €75, €100, €150, €200, €250, €300, €350, €400 and €450.",
      "Official page states one-year validity and online/telephone redemption.",
    ],
  },
  {
    cardId: "cmtb6uqep001u3giya6xdb0l8",
    merchantName: "Globi",
    expectedTitle: "Globi Gift Card",
    expectedOfficialUrl: "https://globi.gr/product/dwrokarta/",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "20",
    maxValue: null,
    customValueAllowed: true,
    values: [],
    validityMonths: 12,
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE"],
    evidence: [
      "Official page describes a digital gift card sent automatically by email.",
      "Official page exposes an Other amount field from €20.",
      "Official page states online checkout-code redemption and 12-month validity.",
    ],
  },
  {
    cardId: "cmtb6urib00203giyzhdgmnv4",
    merchantName: "HelloKids",
    expectedTitle: "HelloKids Gift Card",
    expectedOfficialUrl: "https://www.hellokids.gr/products/%CE%B7%CE%BB%CE%B5%CE%BA%CF%84%CF%81%CE%BF%CE%BD%CE%B9%CE%BA%CE%AE-%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%AC%CF%81%CF%84%CE%B1",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "20",
    maxValue: "200",
    customValueAllowed: false,
    values: [],
    validityMonths: null,
    deliveries: [],
    redemptions: [],
    evidence: [
      "Official product and collection label the offering as an electronic gift card.",
      "Official collection displays a €20–€200 price range; exact fixed values were not inferred.",
    ],
  },
  {
    cardId: "cmtb77ckx0027dkiyltinns4m",
    merchantName: "Mix & Match",
    expectedTitle: "Mix & Match Gift Card",
    expectedOfficialUrl: "https://mixandmatch.gr/product/digital-gift-card/",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "50",
    maxValue: "350",
    customValueAllowed: false,
    values: [],
    validityMonths: 12,
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHYSICAL_STORE"],
    evidence: [
      "Official page calls it a digital gift card sent by email.",
      "Official page displays €50–€350 without exposing the complete option list.",
      "Official page states website/shop redemption and one-year validity.",
    ],
  },
  {
    cardId: "cmtb77r83004bdkiycl9k0utt",
    merchantName: "Antithesis Clothing",
    expectedTitle: "Antithesis Clothing Gift Card",
    expectedOfficialUrl: "https://antithesisclothing.gr/shop/dorokarta/",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "20",
    maxValue: "150",
    customValueAllowed: false,
    values: ["20", "50", "70", "100", "150"],
    validityMonths: null,
    deliveries: ["EMAIL"],
    redemptions: [],
    evidence: [
      "Official page states that the recipient receives the redemption code by email.",
      "Official page lists €20, €50, €70, €100 and €150 options.",
      "No redemption channel was inferred from the page.",
    ],
  },
  {
    cardId: "cmtb77yht005ddkiykt4vsu49",
    merchantName: "Times Store",
    expectedTitle: "Times Store Gift Card",
    expectedOfficialUrl: "https://www.timesstore.gr/timesstore-gift-card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: null,
    maxValue: null,
    customValueAllowed: true,
    values: [],
    validityMonths: null,
    deliveries: ["EMAIL"],
    redemptions: [],
    evidence: [
      "Official page describes an e-gift card presented to the recipient by email.",
      "Official page exposes an amount input; limits were not inferred.",
    ],
  },
  {
    cardId: "cmtb7hxhc000b04iy3qi3vpga",
    merchantName: "Christakis",
    expectedTitle: "Christakis Gift Card",
    expectedOfficialUrl: "https://christakisathens.com/product/christakis-gift-card-online-in-store/",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "50",
    maxValue: "500",
    customValueAllowed: false,
    values: ["50", "100", "200", "500"],
    validityMonths: null,
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHYSICAL_STORE"],
    evidence: [
      "Official page states delivery of a unique code by email.",
      "Official page explicitly supports online and physical-store redemption.",
      "Official page lists €50, €100, €200 and €500.",
    ],
  },
  {
    cardId: "cmtb7i474001904iye9qfchj3",
    merchantName: "Monkees of Athens",
    expectedTitle: "Monkees of Athens Gift Card",
    expectedOfficialUrl: "https://monkeesofathens.com/products/monkees-of-athens-gift-card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "USD",
    minValue: null,
    maxValue: null,
    customValueAllowed: false,
    values: [],
    validityMonths: null,
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHYSICAL_STORE"],
    evidence: [
      "Official page identifies a digital gift card delivered by email.",
      "Official page explicitly supports online and in-store use.",
      "Currency is shown as USD; incomplete denomination options were not stored.",
    ],
  },
];

const OCCASIONS: OccasionSpec[] = [
  {
    cardId: "cmtb77bgd0021dkiyy3u2x8qn",
    merchantName: "Lookshop",
    expectedTitle: "Lookshop Gift Card",
    expectedOfficialUrl: "https://lookshop.gr/giftcard2.html",
    occasionSlug: "fathers-day",
    evidence: ["Official product title is 'Δωροκάρτα Super Dad'; mapped to the existing Father's Day taxonomy."],
  },
  {
    cardId: "cmtb77p0o0040dkiyr700iran",
    merchantName: "Valsamakis",
    expectedTitle: "Valsamakis Gift Card",
    expectedOfficialUrl: "https://valsamakis.gr/name-day-gift-card.html",
    occasionSlug: "name-day",
    evidence: ["Official URL/title explicitly identify a Name Day gift card; mapped to existing Name Day taxonomy."],
  },
  {
    cardId: "cmtb77qi60048dkiyu8khlp3s",
    merchantName: "Alexandris Stores",
    expectedTitle: "Alexandris Stores Gift Card",
    expectedOfficialUrl: "https://alexandrisstores.gr/en/product/valentines-day-gift-card-%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%AC%CF%81%CF%84%CE%B1/",
    occasionSlug: "valentines",
    evidence: ["Official URL/title explicitly identify Valentine's Day; mapped to existing taxonomy."],
  },
  {
    cardId: "cmtb77uej004rdkiydqqx9ujt",
    merchantName: "Cherrybox",
    expectedTitle: "Cherrybox Gift Card",
    expectedOfficialUrl: "https://cherrybox.gr/1683635829833-you-are-my-super-mom-gift-card.html",
    occasionSlug: "mothers-day",
    evidence: ["Official product title is 'You are My Super Mom Gift Card'; mapped to existing Mother's Day taxonomy."],
  },
];

const URL_UPDATES: UrlSpec[] = [
  {
    cardId: "cmtb7769p001bdkiyujfcxt1s",
    merchantName: "Gatos Shoes",
    expectedTitle: "Gatos Shoes Gift Card",
    expectedUrl: "https://gatos-shoes.gr/product/dorokarta-75e/",
    value: "https://gatos-shoes.gr/product-category/doro-kartes/",
    evidence: [
      "Same official merchant domain.",
      "Validated category page lists all four program denominations: €30, €50, €75 and €100.",
      "No variant is created because digital versus physical delivery remains insufficiently explicit.",
    ],
  },
];

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

async function loadState(cardIds: string[]) {
  return prisma.giftCard.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      verificationStatus: true,
      updatedAt: true,
      merchant: { select: { name: true } },
      variants: {
        select: {
          id: true,
          name: true,
          type: true,
          purchaseUrl: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          validityMonths: true,
          values: { select: { value: true }, orderBy: { value: "asc" } },
          deliveries: { select: { method: true }, orderBy: { method: "asc" } },
          redemptions: { select: { channel: true }, orderBy: { channel: "asc" } },
        },
        orderBy: { id: "asc" },
      },
      occasions: { select: { occasion: { select: { id: true, name: true, slug: true } } } },
    },
    orderBy: { id: "asc" },
  });
}

function stateFingerprint(cards: Awaited<ReturnType<typeof loadState>>) {
  return stableHash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      title: card.title,
      officialUrl: card.officialUrl,
      verificationStatus: card.verificationStatus,
      updatedAt: card.updatedAt.toISOString(),
      variants: card.variants.map((variant) => ({
        ...variant,
        minValue: decimal(variant.minValue),
        maxValue: decimal(variant.maxValue),
        values: variant.values.map((item) => decimal(item.value)),
      })),
      occasions: card.occasions.map((item) => item.occasion).sort((a, b) => a.slug.localeCompare(b.slug)),
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
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = ["type", "actionId", "cardId", "merchantName", "expectedTitle", "value", "occasionSlug", "evidence"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...actions.map((action) =>
      headers
        .map((header) => {
          if (header === "value") {
            return csvEscape(action.type === "UPDATE_OFFICIAL_URL" ? action.value : action.type === "CREATE_VARIANT" ? action : "");
          }
          return csvEscape((action as unknown as Record<string, unknown>)[header]);
        })
        .join(","),
    ),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourceAudit): Promise<Plan> {
  const manualIds = new Set(source.rows.filter((row) => row.classification === "MANUAL_REVIEW").map((row) => row.cardId));
  const configuredIds = new Set([
    ...VARIANTS.map((item) => item.cardId),
    ...OCCASIONS.map((item) => item.cardId),
    ...URL_UPDATES.map((item) => item.cardId),
  ]);
  for (const cardId of configuredIds) {
    if (!manualIds.has(cardId)) throw new Error(`Configured card is not MANUAL_REVIEW in v12: ${cardId}`);
  }
  if (configuredIds.size !== manualIds.size) {
    const missing = [...manualIds].filter((cardId) => !configuredIds.has(cardId));
    throw new Error(`Manual cards missing from v14 decision ledger: ${missing.join(", ")}`);
  }

  const cards = await loadState([...configuredIds]);
  if (cards.length !== configuredIds.size) throw new Error(`Expected ${configuredIds.size} cards, found ${cards.length}.`);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const occasions = await prisma.occasion.findMany({
    where: { slug: { in: OCCASIONS.map((item) => item.occasionSlug) }, active: true },
    select: { id: true, name: true, slug: true },
  });
  const occasionsBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion]));

  const actions: Action[] = [];
  for (const spec of VARIANTS) {
    const card = cardsById.get(spec.cardId);
    if (!card) throw new Error(`Missing card ${spec.cardId}.`);
    if (
      card.merchant.name !== spec.merchantName ||
      card.title !== spec.expectedTitle ||
      card.officialUrl !== spec.expectedOfficialUrl ||
      card.variants.length !== 0
    ) {
      throw new Error(`Variant precondition failed for ${spec.cardId}.`);
    }
    actions.push({ ...spec, type: "CREATE_VARIANT", actionId: `create-verified-variant:${spec.cardId}` });
  }
  for (const spec of OCCASIONS) {
    const card = cardsById.get(spec.cardId);
    const occasion = occasionsBySlug.get(spec.occasionSlug);
    if (!card || !occasion) throw new Error(`Occasion precondition data missing for ${spec.cardId}.`);
    if (
      card.merchant.name !== spec.merchantName ||
      card.title !== spec.expectedTitle ||
      card.officialUrl !== spec.expectedOfficialUrl ||
      card.occasions.some((item) => item.occasion.slug === spec.occasionSlug)
    ) {
      throw new Error(`Occasion precondition failed for ${spec.cardId}.`);
    }
    actions.push({
      ...spec,
      type: "CONNECT_OCCASION",
      actionId: `connect-verified-occasion:${spec.cardId}:${spec.occasionSlug}`,
      occasionId: occasion.id,
      occasionName: occasion.name,
    });
  }
  for (const spec of URL_UPDATES) {
    const card = cardsById.get(spec.cardId);
    if (
      !card ||
      card.merchant.name !== spec.merchantName ||
      card.title !== spec.expectedTitle ||
      card.officialUrl !== spec.expectedUrl
    ) {
      throw new Error(`URL precondition failed for ${spec.cardId}.`);
    }
    actions.push({ ...spec, type: "UPDATE_OFFICIAL_URL", actionId: `update-verified-url:${spec.cardId}` });
  }
  actions.sort((a, b) => a.type.localeCompare(b.type) || a.cardId.localeCompare(b.cardId));
  const material = {
    version: 14 as const,
    mode: "PREVIEW" as const,
    sourceAuditId: source.auditId,
    catalogFingerprint: stateFingerprint(cards),
    actionCount: actions.length,
    cardCount: configuredIds.size,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(planMaterial(material)) };
}

async function applyPlan(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("Apply requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored plan.");
  verifyPlan(plan);
  const cards = await loadState([...new Set(plan.actions.map((action) => action.cardId))]);
  if (stateFingerprint(cards) !== plan.catalogFingerprint) throw new Error("Target state changed after preview.");

  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        if (action.type === "CREATE_VARIANT") {
          const currentCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
          if (currentCount !== 0) throw new Error(`Variant appeared after preview for ${action.cardId}.`);
          const created = await tx.giftCardVariant.create({
            data: {
              giftCardId: action.cardId,
              name: action.name,
              type: action.variantType,
              currency: action.currency,
              minValue: action.minValue,
              maxValue: action.maxValue,
              customValueAllowed: action.customValueAllowed,
              purchaseUrl: action.expectedOfficialUrl,
              validityMonths: action.validityMonths,
              values: action.values.length ? { create: action.values.map((value) => ({ value })) } : undefined,
              deliveries: action.deliveries.length
                ? { create: action.deliveries.map((method) => ({ method })) }
                : undefined,
              redemptions: action.redemptions.length
                ? { create: action.redemptions.map((channel) => ({ channel })) }
                : undefined,
            },
            select: { id: true },
          });
          applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: created.id });
          continue;
        }
        if (action.type === "CONNECT_OCCASION") {
          await tx.giftCardOccasion.create({
            data: { giftCardId: action.cardId, occasionId: action.occasionId },
          });
          applied.push({ actionId: action.actionId, cardId: action.cardId, occasionId: action.occasionId });
          continue;
        }
        const result = await tx.giftCard.updateMany({
          where: { id: action.cardId, title: action.expectedTitle, officialUrl: action.expectedUrl },
          data: { officialUrl: action.value, verificationStatus: "NEEDS_REVIEW" },
        });
        if (result.count !== 1) throw new Error(`URL update precondition failed for ${action.cardId}.`);
        applied.push({ actionId: action.actionId, cardId: action.cardId, from: action.expectedUrl, to: action.value });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  fs.writeFileSync(
    APPLY_LOG,
    `${JSON.stringify(
      {
        version: 14,
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

async function postAudit(plan: Plan) {
  const cards = await loadState([...new Set(plan.actions.map((action) => action.cardId))]);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const results = plan.actions.map((action) => {
    const card = cardsById.get(action.cardId);
    let passed = false;
    if (card && action.type === "CREATE_VARIANT") {
      passed = card.variants.some(
        (variant) =>
          variant.name === action.name &&
          variant.type === action.variantType &&
          variant.purchaseUrl === action.expectedOfficialUrl &&
          variant.currency === action.currency &&
          decimal(variant.minValue) === action.minValue &&
          decimal(variant.maxValue) === action.maxValue &&
          variant.customValueAllowed === action.customValueAllowed &&
          variant.validityMonths === action.validityMonths &&
          JSON.stringify(variant.values.map((item) => decimal(item.value)).sort()) === JSON.stringify([...action.values].sort()) &&
          JSON.stringify(variant.deliveries.map((item) => item.method).sort()) === JSON.stringify([...action.deliveries].sort()) &&
          JSON.stringify(variant.redemptions.map((item) => item.channel).sort()) === JSON.stringify([...action.redemptions].sort()),
      );
    } else if (card && action.type === "CONNECT_OCCASION") {
      passed = card.occasions.some((item) => item.occasion.id === action.occasionId);
    } else if (card && action.type === "UPDATE_OFFICIAL_URL") {
      passed = card.officialUrl === action.value && card.verificationStatus === "NEEDS_REVIEW";
    }
    return { actionId: action.actionId, cardId: action.cardId, type: action.type, passed };
  });
  const report = {
    version: 14,
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
    if (plan.sourceAuditId !== source.auditId) throw new Error("The v12 audit changed after preview.");
    const applied = await applyPlan(plan);
    console.log("Dorokartes v14 Manual-Structure Remediation — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${applied.length}`);
    console.log(`Log: ${APPLY_LOG}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    verifyPlan(plan);
    const report = await postAudit(plan);
    console.log("Dorokartes v14 Manual-Structure Remediation — POST-AUDIT");
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
  console.log("Dorokartes v14 Manual-Structure Remediation — PREVIEW");
  console.log(`Source audit: ${plan.sourceAuditId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["CREATE_VARIANT", "CONNECT_OCCASION", "UPDATE_OFFICIAL_URL"] as const) {
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
