import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = 2 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_REPORT = path.join(
  REPORT_DIR,
  "denomination-evidence-v1-preview-28dc3739f07ea237.json",
);
const SOURCE_REPORT_ID = "28dc3739f07ea2373fa3c3e31ac97de895d10938fa9c24a951a2587f753f5266";
const PLAN_JSON = path.join(REPORT_DIR, "denomination-delivery-remediation-v2-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "denomination-delivery-remediation-v2-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "denomination-delivery-remediation-v2-apply.json");
const POST_AUDIT_JSON = path.join(
  REPORT_DIR,
  "denomination-delivery-remediation-v2-post-audit.json",
);

type VariantType = "DIGITAL" | "PHYSICAL";
type DeliveryMethod = "EMAIL" | "PHYSICAL_DELIVERY";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE" | "PHONE";

type EvidenceAssertion = {
  label: string;
  pattern: RegExp;
};

type Specification = {
  cardId: string;
  merchantId: string;
  expectedMerchantName: string;
  expectedMerchantSlug: string;
  expectedTitle: string;
  titleAfter: string;
  expectedSlug: string;
  officialUrl: string;
  variantName: "Digital" | "Physical";
  variantType: VariantType;
  currency: "EUR";
  values: string[];
  deliveryMethods: DeliveryMethod[];
  redemptionChannels: RedemptionChannel[];
  validityMonths: number | null;
  assertions: EvidenceAssertion[];
  evidence: string[];
};

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta1f6090019q8iygnn0tj4u",
    merchantId: "cmta1f5tr0018q8iyo2evq1r0",
    expectedMerchantName: "EpiploSet",
    expectedMerchantSlug: "epiploset",
    expectedTitle: "Δωροκάρτα Ποσό Δωροκάρτας: 50",
    titleAfter: "EpiploSet Gift Card",
    expectedSlug: "epiploset-δωροκαρτα-ποσο-δωροκαρτας-50",
    officialUrl: "https://www.epiploset.gr/product/gift-card/",
    variantName: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    values: ["50", "100", "200", "500"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    assertions: [
      {
        label: "fixed denomination selector",
        pattern: /€\s*50(?:[.,]00)?\s+€\s*100(?:[.,]00)?\s+€\s*200(?:[.,]00)?\s+€\s*500(?:[.,]00)?/iu,
      },
      {
        label: "recipient email field",
        pattern: /πολλές\s+διευθύνσεις\s+ηλεκτρονικού\s+ταχυδρομείου/iu,
      },
    ],
    evidence: [
      "Official product selector lists exactly €50, €100, €200 and €500.",
      "Official recipient form explicitly accepts one or more email addresses.",
    ],
  },
  {
    cardId: "cmta1ksaz00miq8iyz8knfxq5",
    merchantId: "cmta1ks4x00mhq8iydfmn5xou",
    expectedMerchantName: "Kalousos",
    expectedMerchantSlug: "kalousos",
    expectedTitle: "Δωροκάρτα (Gift Card) 50",
    titleAfter: "Kalousos Gift Card",
    expectedSlug: "kalousos-δωροκαρτα-gift-card-50",
    officialUrl: "https://www.kalousos.gr/el/dorokarta-gift-card-50eur.html",
    variantName: "Physical",
    variantType: "PHYSICAL",
    currency: "EUR",
    values: ["50"],
    deliveryMethods: ["PHYSICAL_DELIVERY"],
    redemptionChannels: ["ONLINE", "PHONE", "PHYSICAL_STORE"],
    validityMonths: 6,
    assertions: [
      {
        label: "€50 product identity",
        pattern: /Δωροκάρτα\s+\(Gift Card\)\s+50\s*€/iu,
      },
      {
        label: "physical card delivery",
        pattern: /Η\s+κάρτα\s+της\s+φωτογραφίας\s+αποστέλλεται\s+σε\s+εσάς\s+ή\s+απευθείας\s+στον\s+αποδέκτη/iu,
      },
      { label: "online redemption", pattern: /[ΟO]nline\s+στο\s+www\.kalousos\.gr/iu },
      { label: "phone redemption", pattern: /[TΤ]ηλεφωνικά\s+με\s+απαραίτητη\s+αναφορά/iu },
      {
        label: "store redemption",
        pattern: /Στα\s+φυσικά\s+μας\s+καταστήματα\s+Αθήνα\s+και\s+Θεσ\/νίκη/iu,
      },
      { label: "six-month validity", pattern: /Η\s+κάρτα\s+ισχύει\s+για\s+6\s+μήνες/iu },
    ],
    evidence: [
      "Official product page identifies the physical €50 card.",
      "Official copy says the pictured card is sent to the buyer or recipient.",
      "Official copy explicitly permits online, phone and physical-store redemption.",
      "Official copy states six-month validity.",
    ],
  },
  {
    cardId: "cmta4yw6q002xsciynztac1t7",
    merchantId: "cmta4yw0c002wsciyir3okmhf",
    expectedMerchantName: "Msystems",
    expectedMerchantSlug: "msystems-δωροκαρτα-10e",
    expectedTitle: "Msystems Δωροκάρτα 10e | Δωροκάρτες",
    titleAfter: "Msystems Gift Card",
    expectedSlug: "msystems-δωροκαρτα-10e-msystems-δωροκαρτα-10e-δωροκαρτες",
    officialUrl: "https://www.msystems.gr/gifcards/msystems-giftcard-10e",
    variantName: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    values: ["10"],
    deliveryMethods: [],
    redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
    validityMonths: 12,
    assertions: [
      { label: "€10 product identity", pattern: /Msystems\s+Δωροκάρτα\s+10\s*€/iu },
      {
        label: "electronic-only form",
        pattern: /Η\s+Δωροκάρτα\s+παρέχεται\s+μόνο\s+σε\s+ηλεκτρονική\s+μορφή/iu,
      },
      {
        label: "online and store redemption",
        pattern: /στο\s+φυσικό\s+ή\s+διαδικτυακό\s+κατάστημα\s+της\s+Msystems/iu,
      },
      {
        label: "one-year validity",
        pattern: /για\s+χρονική\s+περίοδο\s+ενός\s+έτους/iu,
      },
    ],
    evidence: [
      "Official product page and structured data confirm the €10 value.",
      "Official copy says the gift card is provided only electronically.",
      "Official copy explicitly permits physical- or online-store redemption.",
      "Official copy states one-year validity.",
    ],
  },
  {
    cardId: "cmtb77n4m003qdkiyjf9v5mzc",
    merchantId: "cmtb77mzs003pdkiyc12og14q",
    expectedMerchantName: "Topgreekwines",
    expectedMerchantSlug: "topgreekwines",
    expectedTitle: "Gift voucher 50€",
    titleAfter: "Topgreekwines Gift Card",
    expectedSlug: "topgreekwines-gift-voucher-50",
    officialUrl: "https://www.topgreekwines.gr/en-gb/gift-voucher-50%E2%82%AC-wines.html",
    variantName: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    values: ["50"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    assertions: [
      { label: "€50 voucher identity", pattern: /Gift\s+voucher\s+worth\s+50\s*€/iu },
      {
        label: "beneficiary email notification",
        pattern: /inform\s+by\s+message\s+and\s+email\s+the\s+beneficiary/iu,
      },
      {
        label: "specific voucher code",
        pattern: /gift\s+voucher\s+with\s+the\s+specific\s+code/iu,
      },
    ],
    evidence: [
      "Official product page identifies a €50 gift voucher.",
      "Official copy says the beneficiary is informed by email and receives a specific code.",
    ],
  },
];

type SourceFinding = {
  cardId: string;
  merchantId: string;
  officialUrl: string;
  finalUrl: string | null;
  status: string;
  existingVariantCount: number;
};

type SourceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: SourceFinding[];
};

type TargetState = Awaited<ReturnType<typeof loadTargets>>[number];

type Action =
  | {
      type: "UPDATE_CARD_TITLE";
      actionId: string;
      cardId: string;
      merchantId: string;
      expectedTitle: string;
      titleAfter: string;
      expectedUpdatedAt: string;
      officialUrl: string;
      evidence: string[];
    }
  | {
      type: "CREATE_VARIANT";
      actionId: string;
      cardId: string;
      merchantId: string;
      expectedTitleAfter: string;
      variantName: "Digital" | "Physical";
      variantType: VariantType;
      currency: "EUR";
      values: string[];
      purchaseUrl: string;
      deliveryMethods: DeliveryMethod[];
      redemptionChannels: RedemptionChannel[];
      validityMonths: number | null;
      evidence: string[];
    };

type LiveEvidence = {
  cardId: string;
  officialUrl: string;
  finalUrl: string;
  checks: Array<{ label: string; matched: string }>;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  targetFingerprint: string;
  liveEvidenceFingerprint: string;
  planId: string;
  cardCount: number;
  actionCount: number;
  liveEvidence: LiveEvidence[];
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

function decodeHtml(text: string) {
  const named: Record<string, string> = {
    alpha: "α",
    amp: "&",
    apos: "'",
    beta: "β",
    chi: "χ",
    delta: "δ",
    epsilon: "ε",
    euro: "€",
    eta: "η",
    gamma: "γ",
    gt: ">",
    hellip: "…",
    iota: "ι",
    kappa: "κ",
    laquo: "«",
    lambda: "λ",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mu: "μ",
    nbsp: " ",
    nu: "ν",
    omega: "ω",
    omicron: "ο",
    phi: "φ",
    pi: "π",
    psi: "ψ",
    quot: '"',
    raquo: "»",
    rdquo: "”",
    rho: "ρ",
    rsquo: "’",
    sigma: "σ",
    sigmaf: "ς",
    tau: "τ",
    theta: "θ",
    upsilon: "υ",
    xi: "ξ",
    zeta: "ζ",
  };
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&([a-z]+);/giu, (entity, name: string) => {
      const decoded = named[name.toLowerCase()];
      if (!decoded) return entity;
      return name[0] === name[0]?.toUpperCase() && /[α-ω]/u.test(decoded)
        ? decoded.toUpperCase()
        : decoded;
    });
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
}

function canonicalPageKey(url: string) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/u, "") || "/";
  return `${parsed.protocol}//${hostname}${pathname}${parsed.search}`;
}

async function collectLiveEvidence(specification: Specification): Promise<LiveEvidence> {
  const response = await fetch(specification.officialUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "el-GR,el;q=0.9,en;q=0.8",
      "user-agent": "DorokartesCatalogAudit/2.0 (+https://dorokartes.gr)",
    },
  });
  if (!response.ok) {
    throw new Error(`Official source returned HTTP ${response.status} for ${specification.cardId}.`);
  }
  if (canonicalPageKey(response.url) !== canonicalPageKey(specification.officialUrl)) {
    throw new Error(`Official URL redirected away from the approved page for ${specification.cardId}.`);
  }
  const text = htmlToText(await response.text());
  const checks = specification.assertions.map((assertion) => {
    const match = text.match(assertion.pattern)?.[0];
    if (!match) {
      throw new Error(`Missing live evidence "${assertion.label}" for ${specification.cardId}.`);
    }
    return { label: assertion.label, matched: match.replace(/\s+/gu, " ").trim() };
  });
  return {
    cardId: specification.cardId,
    officialUrl: specification.officialUrl,
    finalUrl: response.url,
    checks,
  };
}

async function collectAllLiveEvidence() {
  const evidence = await Promise.all(SPECIFICATIONS.map(collectLiveEvidence));
  return evidence.sort((left, right) => left.cardId.localeCompare(right.cardId));
}

async function loadTargets() {
  return prisma.giftCard.findMany({
    where: { id: { in: SPECIFICATIONS.map((specification) => specification.cardId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      updatedAt: true,
      merchant: { select: { name: true, slug: true, updatedAt: true } },
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
          active: true,
          values: { orderBy: { value: "asc" }, select: { value: true } },
          deliveries: { orderBy: { method: "asc" }, select: { method: true } },
          redemptions: { orderBy: { channel: "asc" }, select: { channel: true } },
        },
      },
    },
  });
}

function targetSnapshot(cards: TargetState[]) {
  return cards.map((card) => ({
    id: card.id,
    merchantId: card.merchantId,
    merchantName: card.merchant.name,
    merchantSlug: card.merchant.slug,
    merchantUpdatedAt: card.merchant.updatedAt.toISOString(),
    title: card.title,
    slug: card.slug,
    officialUrl: card.officialUrl,
    status: card.status,
    updatedAt: card.updatedAt.toISOString(),
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
      active: variant.active,
      values: variant.values.map((item) => decimal(item.value)),
      deliveries: variant.deliveries.map((item) => item.method),
      redemptions: variant.redemptions.map((item) => item.channel),
    })),
  }));
}

function fingerprint(cards: TargetState[]) {
  return stableHash(targetSnapshot(cards));
}

function assertSource(source: SourceReport) {
  if (source.mode !== "PREVIEW" || source.reportId !== SOURCE_REPORT_ID) {
    throw new Error("The immutable evidence report does not match the approved source report.");
  }
  for (const specification of SPECIFICATIONS) {
    const finding = source.findings.find((item) => item.cardId === specification.cardId);
    if (
      !finding ||
      finding.merchantId !== specification.merchantId ||
      finding.officialUrl !== specification.officialUrl ||
      !finding.finalUrl ||
      canonicalPageKey(finding.finalUrl) !== canonicalPageKey(specification.officialUrl) ||
      finding.status !== "SUPPORTED_AS_IS" ||
      finding.existingVariantCount !== 0
    ) {
      throw new Error(`Evidence-report precondition failed for ${specification.cardId}.`);
    }
  }
}

function specificationComplete(card: TargetState, specification: Specification) {
  const expectedValues = specification.values.map(Number).sort((left, right) => left - right);
  const variant = card.variants[0];
  const actualValues =
    variant?.values.map((item) => Number(String(item.value))).sort((left, right) => left - right) || [];
  const deliveries = variant?.deliveries.map((item) => item.method).sort() || [];
  const redemptions = variant?.redemptions.map((item) => item.channel).sort() || [];
  return Boolean(
    card.merchantId === specification.merchantId &&
      card.merchant.name === specification.expectedMerchantName &&
      card.merchant.slug === specification.expectedMerchantSlug &&
      card.title === specification.titleAfter &&
      card.slug === specification.expectedSlug &&
      card.officialUrl === specification.officialUrl &&
      card.status === "ACTIVE" &&
      card.variants.length === 1 &&
      variant?.name === specification.variantName &&
      variant.type === specification.variantType &&
      variant.currency === specification.currency &&
      decimal(variant.minValue) === String(Math.min(...expectedValues)) &&
      decimal(variant.maxValue) === String(Math.max(...expectedValues)) &&
      !variant.customValueAllowed &&
      variant.purchaseUrl === specification.officialUrl &&
      variant.validityMonths === specification.validityMonths &&
      variant.active &&
      JSON.stringify(actualValues) === JSON.stringify(expectedValues) &&
      JSON.stringify(deliveries) === JSON.stringify([...specification.deliveryMethods].sort()) &&
      JSON.stringify(redemptions) === JSON.stringify([...specification.redemptionChannels].sort())
  );
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = [
    "type",
    "actionId",
    "cardId",
    "merchantId",
    "expectedTitle",
    "titleAfter",
    "variantType",
    "currency",
    "values",
    "purchaseUrl",
    "deliveryMethods",
    "redemptionChannels",
    "validityMonths",
    "evidence",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) => {
      const row: Record<string, unknown> = { ...action };
      return headers.map((header) => csvEscape(row[header])).join(",");
    }),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourceReport): Promise<Plan> {
  assertSource(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectAllLiveEvidence()]);
  if (cards.length !== SPECIFICATIONS.length) throw new Error("A denomination target card is missing.");
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pending = SPECIFICATIONS.filter((specification) => {
    const card = byId.get(specification.cardId);
    return !card || !specificationComplete(card, specification);
  });
  for (const specification of pending) {
    const card = byId.get(specification.cardId);
    if (
      !card ||
      card.merchantId !== specification.merchantId ||
      card.merchant.name !== specification.expectedMerchantName ||
      card.merchant.slug !== specification.expectedMerchantSlug ||
      card.title !== specification.expectedTitle ||
      card.slug !== specification.expectedSlug ||
      card.officialUrl !== specification.officialUrl ||
      card.status !== "ACTIVE" ||
      card.variants.length !== 0
    ) {
      throw new Error(`Catalog precondition failed for ${specification.cardId}.`);
    }
  }
  const actions: Action[] = pending.flatMap((specification) => {
    const card = byId.get(specification.cardId)!;
    return [
      {
        type: "UPDATE_CARD_TITLE" as const,
        actionId: `update-card-title:${specification.cardId}`,
        cardId: specification.cardId,
        merchantId: specification.merchantId,
        expectedTitle: specification.expectedTitle,
        titleAfter: specification.titleAfter,
        expectedUpdatedAt: card.updatedAt.toISOString(),
        officialUrl: specification.officialUrl,
        evidence: specification.evidence,
      },
      {
        type: "CREATE_VARIANT" as const,
        actionId: `create-${specification.variantType.toLowerCase()}-variant:${specification.cardId}`,
        cardId: specification.cardId,
        merchantId: specification.merchantId,
        expectedTitleAfter: specification.titleAfter,
        variantName: specification.variantName,
        variantType: specification.variantType,
        currency: specification.currency,
        values: specification.values,
        purchaseUrl: specification.officialUrl,
        deliveryMethods: specification.deliveryMethods,
        redemptionChannels: specification.redemptionChannels,
        validityMonths: specification.validityMonths,
        evidence: specification.evidence,
      },
    ];
  });
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    targetFingerprint: fingerprint(cards),
    liveEvidenceFingerprint: stableHash(liveEvidence),
    cardCount: pending.length,
    actionCount: actions.length,
    liveEvidence,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(material) };
}

function assertPlanRequest(plan: Plan) {
  if (plan.version !== VERSION) throw new Error("Stored plan version does not match this script.");
  if (!REQUESTED_PLAN_ID) throw new Error("This operation requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function applyPlan(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan);
  assertSource(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectAllLiveEvidence()]);
  if (fingerprint(cards) !== plan.targetFingerprint) {
    throw new Error("Target state changed after preview; refusing to apply.");
  }
  if (stableHash(liveEvidence) !== plan.liveEvidenceFingerprint) {
    throw new Error("Live official-page evidence changed after preview; refusing to apply.");
  }
  const specificationsByCard = new Map(SPECIFICATIONS.map((item) => [item.cardId, item]));
  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        const specification = specificationsByCard.get(action.cardId);
        if (!specification) throw new Error(`Unknown plan target ${action.cardId}.`);
        if (action.type === "UPDATE_CARD_TITLE") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: action.expectedTitle,
              slug: specification.expectedSlug,
              officialUrl: action.officialUrl,
              status: "ACTIVE",
              updatedAt: new Date(action.expectedUpdatedAt),
            },
            data: { title: action.titleAfter },
          });
          if (result.count !== 1) throw new Error(`Card precondition failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, from: action.expectedTitle, to: action.titleAfter });
          continue;
        }
        const card = await tx.giftCard.findUnique({
          where: { id: action.cardId },
          select: {
            merchantId: true,
            title: true,
            slug: true,
            officialUrl: true,
            status: true,
            merchant: { select: { name: true, slug: true } },
          },
        });
        const variantCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
        if (
          !card ||
          card.merchantId !== action.merchantId ||
          card.merchant.name !== specification.expectedMerchantName ||
          card.merchant.slug !== specification.expectedMerchantSlug ||
          card.title !== action.expectedTitleAfter ||
          card.slug !== specification.expectedSlug ||
          card.officialUrl !== action.purchaseUrl ||
          card.status !== "ACTIVE" ||
          variantCount !== 0
        ) {
          throw new Error(`Variant precondition failed for ${action.cardId}.`);
        }
        const numbers = action.values.map(Number);
        const variant = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: action.variantName,
            type: action.variantType,
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
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function postAudit(plan: Plan) {
  assertPlanRequest(plan);
  const cards = await loadTargets();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const results = SPECIFICATIONS.map((specification) => {
    const card = byId.get(specification.cardId);
    return {
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      passed: Boolean(card && specificationComplete(card, specification)),
      preserved: card
        ? {
            merchantName: card.merchant.name,
            merchantSlug: card.merchant.slug,
            cardSlug: card.slug,
            officialUrl: card.officialUrl,
            status: card.status,
          }
        : null,
    };
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
  const source = readJson<SourceReport>(SOURCE_REPORT);
  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    if (plan.sourceReportId !== source.reportId) throw new Error("Evidence report changed after preview.");
    const report = await applyPlan(plan, source);
    console.log("Dorokartes Denomination Delivery Remediation v2 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Denomination Delivery Remediation v2 — POST-AUDIT");
    console.log(`Checked cards: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  fs.writeFileSync(
    path.join(REPORT_DIR, `denomination-delivery-remediation-v2-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Denomination Delivery Remediation v2 — PREVIEW");
  console.log(`Evidence report: ${plan.sourceReportId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  console.log(`  UPDATE_CARD_TITLE: ${plan.actions.filter((action) => action.type === "UPDATE_CARD_TITLE").length}`);
  console.log(`  CREATE_VARIANT: ${plan.actions.filter((action) => action.type === "CREATE_VARIANT").length}`);
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
