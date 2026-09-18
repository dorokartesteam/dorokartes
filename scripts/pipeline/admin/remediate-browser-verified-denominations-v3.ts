import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = 3 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID =
  process.argv.find((argument) => argument.startsWith("--plan-id="))?.slice("--plan-id=".length) ||
  null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_REPORT = path.join(
  REPORT_DIR,
  "denomination-evidence-v1-preview-28dc3739f07ea237.json",
);
const SOURCE_REPORT_ID = "28dc3739f07ea2373fa3c3e31ac97de895d10938fa9c24a951a2587f753f5266";
const PLAN_JSON = path.join(REPORT_DIR, "browser-verified-denominations-v3-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "browser-verified-denominations-v3-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "browser-verified-denominations-v3-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "browser-verified-denominations-v3-post-audit.json");

type DeliveryMethod = "EMAIL";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE";

type SourceSpecification = {
  url: string;
  assertions: Array<{ label: string; pattern: RegExp }>;
};

type Specification = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  expectedTitle: string;
  titleAfter: string;
  cardSlug: string;
  officialUrlBefore: string;
  officialUrlAfter: string;
  values: string[];
  deliveryMethods: DeliveryMethod[];
  redemptionChannels: RedemptionChannel[];
  validityMonths: number | null;
  sources: SourceSpecification[];
  evidence: string[];
};

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta4ybyz000lsciyi05bqwwl",
    merchantId: "cmta4ybsv000ksciy2wk84kj0",
    merchantName: "Candlejuice",
    merchantSlug: "candlejuice",
    expectedTitle: "Δωροκάρτα CandleJuice Gift Card 100€",
    titleAfter: "Candlejuice Gift Card",
    cardSlug: "candlejuice-δωροκαρτα-candlejuice-gift-card-100",
    officialUrlBefore: "https://candlejuice.gr/product/dorokarta-candlejuice-gift-card-100e/",
    officialUrlAfter:
      "https://candlejuice.gr/product-category/dorokartes-candlejuice-gift-cards/",
    values: ["10", "25", "50", "100"],
    deliveryMethods: [],
    redemptionChannels: [],
    validityMonths: null,
    sources: [
      {
        url: "https://candlejuice.gr/product/dorokarta-candlejuice-gift-card-100e/",
        assertions: [
          {
            label: "€100 product identity",
            pattern: /Δωροκάρτα\s+CandleJuice\s+Gift\s+Card\s+100\s*€/iu,
          },
          {
            label: "explicit digital format",
            pattern: /Elegant\s+digital\s+gifting\s+experience/iu,
          },
        ],
      },
      {
        url: "https://candlejuice.gr/product-category/dorokartes-candlejuice-gift-cards/",
        assertions: [
          { label: "€10 denomination", pattern: /Gift\s+Card\s+10\s*€/iu },
          { label: "€25 denomination", pattern: /Gift\s+Card\s+25\s*€/iu },
          { label: "€50 denomination", pattern: /Gift\s+Card\s+50\s*€/iu },
          { label: "€100 denomination", pattern: /Gift\s+Card\s+100\s*€/iu },
        ],
      },
    ],
    evidence: [
      "Official product copy explicitly calls this a digital gifting experience.",
      "Official gift-card category lists €10, €25, €50 and €100.",
      "The official general gift-card category replaces the denomination-specific catalog URL.",
    ],
  },
  {
    cardId: "cmtb78fkx007odkiylrl8o7it",
    merchantId: "cmtb78ffp007ndkiyn4woc6vx",
    merchantName: "Hobbywood",
    merchantSlug: "δωροκαρτα-100",
    expectedTitle: "ΔΩΡΟΚΑΡΤΑ 100€",
    titleAfter: "Hobbywood Gift Card",
    cardSlug: "δωροκαρτα-100-δωροκαρτα-100",
    officialUrlBefore: "https://www.hobbywood.gr/GIFTCARD100",
    officialUrlAfter: "https://www.hobbywood.gr/GIFTCARD100",
    values: ["5", "10", "100"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
    validityMonths: 12,
    sources: [
      {
        url: "https://www.hobbywood.gr/GIFTCARD100",
        assertions: [
          { label: "€100 product identity", pattern: /ΔΩΡΟΚΑΡΤΑ\s+100\s*€/iu },
          {
            label: "recipient email delivery",
            pattern: /το\s+e-mail\s+και\s+ονοματεπώνυμο\s+του\s+παραλήπτη/iu,
          },
          {
            label: "buyer email fallback",
            pattern: /θα\s+έρθει\s+στο\s+δικό\s+σας\s+e-mail/iu,
          },
          { label: "€10 denomination", pattern: /κάρτα\s+των\s+10\s*€/iu },
          { label: "€5 denomination", pattern: /κάρτα\s+των\s+5\s*€/iu },
          { label: "one-year validity", pattern: /Ισχύει\s+για\s+ένα\s+έτος/iu },
          {
            label: "online and store redemption",
            pattern: /φυσικό\s+ή\s+το\s+ηλεκτρονικό\s+μας\s+κατάστημα/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official page says the voucher is emailed to the recipient or buyer.",
      "Official page confirms €100 and links the €10 and €5 cards as combinable values.",
      "Official terms state one-year validity and online/physical-store redemption.",
      "No unverified general URL is substituted, so the exact official product URL is preserved.",
    ],
  },
  {
    cardId: "cmta5nw9j001t54iybpluaasg",
    merchantId: "cmta5nw46001s54iy628m45ik",
    merchantName: "Poem Luxury",
    merchantSlug: "poem-luxury-100",
    expectedTitle: "Δωροκάρτα Poem-Luxury 100",
    titleAfter: "Poem Luxury Gift Card",
    cardSlug: "poem-luxury-100-δωροκαρτα-poem-luxury-100",
    officialUrlBefore: "https://poem-luxury.gr/product/giftcard-100/",
    officialUrlAfter: "https://poem-luxury.gr/product-category/wps_wgm_giftcard/",
    values: ["50", "100"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    sources: [
      {
        url: "https://poem-luxury.gr/product/giftcard-100/",
        assertions: [
          {
            label: "€100 product identity",
            pattern: /Δωροκάρτα\s+Poem-Luxury\s+100\s*€/iu,
          },
          { label: "delivery selector", pattern: /Τρόπος\s+Παράδοσης/iu },
          {
            label: "recipient email delivery",
            pattern: /Θα\s+το\s+στείλουμε\s+στη\s+διεύθυνση\s+email\s+του\s+παραλήπτη/iu,
          },
        ],
      },
      {
        url: "https://poem-luxury.gr/product-category/wps_wgm_giftcard/",
        assertions: [
          { label: "€50 denomination", pattern: /Δωροκάρτα\s+Poem-Luxury\s+50\s*€/iu },
          { label: "€100 denomination", pattern: /Δωροκάρτα\s+Poem-Luxury\s+100\s*€/iu },
        ],
      },
    ],
    evidence: [
      "Official product page explicitly states delivery to the recipient email address.",
      "Official gift-card category lists €50 and €100.",
      "The official general gift-card category replaces the denomination-specific catalog URL.",
    ],
  },
  {
    cardId: "cmtb77ob5003wdkiyrw1g9la4",
    merchantId: "cmtb77o6f003vdkiysq2nbo5o",
    merchantName: "Tsiantakishome",
    merchantSlug: "tsiantakishome",
    expectedTitle: "Δωροκάρτα 40",
    titleAfter: "Tsiantakishome Gift Card",
    cardSlug: "tsiantakishome-δωροκαρτα-40",
    officialUrlBefore: "https://www.tsiantakishome.gr/shop/dwrokartes/dwrokarta-40e/",
    officialUrlAfter: "https://www.tsiantakishome.gr/c/dwrokartes/",
    values: ["40", "80", "90", "100"],
    deliveryMethods: ["EMAIL"],
    redemptionChannels: [],
    validityMonths: null,
    sources: [
      {
        url: "https://www.tsiantakishome.gr/shop/dwrokartes/dwrokarta-40e/",
        assertions: [
          { label: "€40 product identity", pattern: /Δωροκάρτα\s+40\s*€/iu },
          {
            label: "recipient email delivery",
            pattern: /διευθύνσεις\s+ηλεκτρονικού\s+ταχυδρομείου\s+των\s+παραληπτών\s+της\s+δωροκάρτας/iu,
          },
          { label: "delivery-date field", pattern: /Ημερομηνία\s+παράδοσης/iu },
        ],
      },
      {
        url: "https://www.tsiantakishome.gr/c/dwrokartes/",
        assertions: [
          { label: "€40 denomination", pattern: /Δωροκάρτα\s+40\s*€/iu },
          { label: "€80 denomination", pattern: /Δωροκάρτα\s+80\s*€/iu },
          { label: "€90 denomination", pattern: /Δωροκάρτα\s+90\s*€/iu },
          { label: "€100 denomination", pattern: /Δωροκάρτα\s+100\s*€/iu },
        ],
      },
    ],
    evidence: [
      "Official product form explicitly requests recipient email addresses and a delivery date.",
      "Official gift-card category lists €40, €80, €90 and €100.",
      "The official general gift-card category replaces the denomination-specific catalog URL.",
    ],
  },
];

type SourceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: Array<{
    cardId: string;
    merchantId: string;
    officialUrl: string;
    finalUrl: string | null;
    status: string;
    existingVariantCount: number;
  }>;
};

type LiveEvidence = {
  cardId: string;
  pages: Array<{
    requestedUrl: string;
    finalUrl: string;
    checks: Array<{ label: string; matched: string }>;
  }>;
};

type TargetState = Awaited<ReturnType<typeof loadTargets>>[number];

type Action =
  | {
      type: "UPDATE_CARD_TITLE";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      expectedUpdatedAt: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_OFFICIAL_URL";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      evidence: string[];
    }
  | {
      type: "CREATE_VARIANT";
      actionId: string;
      cardId: string;
      merchantId: string;
      expectedTitleAfter: string;
      officialUrlAfter: string;
      values: string[];
      deliveryMethods: DeliveryMethod[];
      redemptionChannels: RedemptionChannel[];
      validityMonths: number | null;
      evidence: string[];
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
    alpha: "α", amp: "&", apos: "'", beta: "β", chi: "χ", delta: "δ", epsilon: "ε",
    eta: "η", euro: "€", gamma: "γ", gt: ">", iota: "ι", kappa: "κ", lambda: "λ",
    lt: "<", mu: "μ", nbsp: " ", nu: "ν", omega: "ω", omicron: "ο", phi: "φ",
    pi: "π", psi: "ψ", quot: '"', rho: "ρ", sigma: "σ", sigmaf: "ς", tau: "τ",
    theta: "θ", upsilon: "υ", xi: "ξ", zeta: "ζ",
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
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/u, "") || "/";
  return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
}

async function inspectSource(source: SourceSpecification) {
  const response = await fetch(source.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "el-GR,el;q=0.9,en;q=0.8",
      "user-agent": "DorokartesCatalogAudit/3.0 (+https://dorokartes.gr)",
    },
  });
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}: ${source.url}`);
  if (canonicalPageKey(response.url) !== canonicalPageKey(source.url)) {
    throw new Error(`Official source redirected away from its approved page: ${source.url}`);
  }
  const text = htmlToText(await response.text());
  const checks = source.assertions.map((assertion) => {
    const matched = text.match(assertion.pattern)?.[0];
    if (!matched) throw new Error(`Missing live evidence "${assertion.label}": ${source.url}`);
    return { label: assertion.label, matched: matched.replace(/\s+/gu, " ").trim() };
  });
  return { requestedUrl: source.url, finalUrl: response.url, checks };
}

async function collectLiveEvidence() {
  const evidence = await Promise.all(
    SPECIFICATIONS.map(async (specification) => ({
      cardId: specification.cardId,
      pages: await Promise.all(specification.sources.map(inspectSource)),
    })),
  );
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

function assertSourceReport(source: SourceReport) {
  if (source.mode !== "PREVIEW" || source.reportId !== SOURCE_REPORT_ID) {
    throw new Error("The immutable denomination report does not match the approved source.");
  }
  for (const specification of SPECIFICATIONS) {
    const finding = source.findings.find((item) => item.cardId === specification.cardId);
    if (
      !finding ||
      finding.merchantId !== specification.merchantId ||
      finding.officialUrl !== specification.officialUrlBefore ||
      !finding.finalUrl ||
      canonicalPageKey(finding.finalUrl) !== canonicalPageKey(specification.officialUrlBefore) ||
      finding.status !== "SUPPORTED_AS_IS" ||
      finding.existingVariantCount !== 0
    ) {
      throw new Error(`Evidence-report precondition failed for ${specification.cardId}.`);
    }
  }
}

function specificationComplete(card: TargetState, specification: Specification) {
  const variant = card.variants[0];
  const expectedValues = specification.values.map(Number).sort((left, right) => left - right);
  const actualValues =
    variant?.values.map((item) => Number(String(item.value))).sort((left, right) => left - right) || [];
  return Boolean(
    card.merchantId === specification.merchantId &&
      card.merchant.name === specification.merchantName &&
      card.merchant.slug === specification.merchantSlug &&
      card.title === specification.titleAfter &&
      card.slug === specification.cardSlug &&
      card.officialUrl === specification.officialUrlAfter &&
      card.status === "ACTIVE" &&
      card.variants.length === 1 &&
      variant?.name === "Digital" &&
      variant.type === "DIGITAL" &&
      variant.currency === "EUR" &&
      decimal(variant.minValue) === String(Math.min(...expectedValues)) &&
      decimal(variant.maxValue) === String(Math.max(...expectedValues)) &&
      !variant.customValueAllowed &&
      variant.purchaseUrl === specification.officialUrlAfter &&
      variant.validityMonths === specification.validityMonths &&
      variant.active &&
      JSON.stringify(actualValues) === JSON.stringify(expectedValues) &&
      JSON.stringify(variant.deliveries.map((item) => item.method).sort()) ===
        JSON.stringify([...specification.deliveryMethods].sort()) &&
      JSON.stringify(variant.redemptions.map((item) => item.channel).sort()) ===
        JSON.stringify([...specification.redemptionChannels].sort())
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
  const headers = ["type", "actionId", "cardId", "merchantId", "expected", "value", "values", "deliveryMethods", "redemptionChannels", "validityMonths", "evidence"];
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
  assertSourceReport(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
  if (cards.length !== SPECIFICATIONS.length) throw new Error("A browser-verified target is missing.");
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
      card.merchant.name !== specification.merchantName ||
      card.merchant.slug !== specification.merchantSlug ||
      card.title !== specification.expectedTitle ||
      card.slug !== specification.cardSlug ||
      card.officialUrl !== specification.officialUrlBefore ||
      card.status !== "ACTIVE" ||
      card.variants.length !== 0
    ) {
      throw new Error(`Catalog precondition failed for ${specification.cardId}.`);
    }
  }
  const actions: Action[] = [];
  for (const specification of pending) {
    const card = byId.get(specification.cardId)!;
    actions.push({
      type: "UPDATE_CARD_TITLE",
      actionId: `update-title:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expected: specification.expectedTitle,
      value: specification.titleAfter,
      expectedUpdatedAt: card.updatedAt.toISOString(),
      evidence: specification.evidence,
    });
    if (specification.officialUrlBefore !== specification.officialUrlAfter) {
      actions.push({
        type: "UPDATE_OFFICIAL_URL",
        actionId: `update-official-url:${specification.cardId}`,
        cardId: specification.cardId,
        merchantId: specification.merchantId,
        expected: specification.officialUrlBefore,
        value: specification.officialUrlAfter,
        evidence: specification.evidence,
      });
    }
    actions.push({
      type: "CREATE_VARIANT",
      actionId: `create-digital-variant:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expectedTitleAfter: specification.titleAfter,
      officialUrlAfter: specification.officialUrlAfter,
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
  assertSourceReport(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
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
              title: action.expected,
              slug: specification.cardSlug,
              officialUrl: specification.officialUrlBefore,
              status: "ACTIVE",
              updatedAt: new Date(action.expectedUpdatedAt),
            },
            data: { title: action.value },
          });
          if (result.count !== 1) throw new Error(`Title precondition failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
          continue;
        }
        if (action.type === "UPDATE_OFFICIAL_URL") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: specification.titleAfter,
              slug: specification.cardSlug,
              officialUrl: action.expected,
              status: "ACTIVE",
            },
            data: { officialUrl: action.value },
          });
          if (result.count !== 1) throw new Error(`URL precondition failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
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
          card.merchant.name !== specification.merchantName ||
          card.merchant.slug !== specification.merchantSlug ||
          card.title !== action.expectedTitleAfter ||
          card.slug !== specification.cardSlug ||
          card.officialUrl !== action.officialUrlAfter ||
          card.status !== "ACTIVE" ||
          variantCount !== 0
        ) {
          throw new Error(`Variant precondition failed for ${action.cardId}.`);
        }
        const values = action.values.map(Number);
        const variant = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: "Digital",
            type: "DIGITAL",
            currency: "EUR",
            minValue: String(Math.min(...values)),
            maxValue: String(Math.max(...values)),
            customValueAllowed: false,
            purchaseUrl: action.officialUrlAfter,
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
    const report = await applyPlan(plan, source);
    console.log("Dorokartes Browser-Verified Denominations v3 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Browser-Verified Denominations v3 — POST-AUDIT");
    console.log(`Checked cards: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  fs.writeFileSync(
    path.join(REPORT_DIR, `browser-verified-denominations-v3-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Browser-Verified Denominations v3 — PREVIEW");
  console.log(`Evidence report: ${plan.sourceReportId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["UPDATE_CARD_TITLE", "UPDATE_OFFICIAL_URL", "CREATE_VARIANT"] as const) {
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
