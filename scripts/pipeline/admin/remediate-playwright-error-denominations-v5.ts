import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { prisma } from "../../../lib/prisma";

const VERSION = 5 as const;
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
const PLAN_JSON = path.join(REPORT_DIR, "playwright-error-denominations-v5-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "playwright-error-denominations-v5-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "playwright-error-denominations-v5-apply.json");
const POST_AUDIT_JSON = path.join(
  REPORT_DIR,
  "playwright-error-denominations-v5-post-audit.json",
);

type DeliveryMethod = "EMAIL";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE";
type AssertionScope = "BODY" | "CONTROLS";

type SourceSpecification = {
  url: string;
  expectedFinalUrl?: string;
  assertions: Array<{ label: string; scope?: AssertionScope; pattern: RegExp }>;
};

type VariantSpecification = {
  name: "Digital";
  type: "DIGITAL";
  minValue: string;
  maxValue: string;
  customValueAllowed: boolean;
  values: string[];
  deliveryMethods: DeliveryMethod[];
  redemptionChannels: RedemptionChannel[];
  validityMonths: number | null;
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
  sourceError: "PAGE_HTTP_403";
  variant: VariantSpecification;
  sources: SourceSpecification[];
  evidence: string[];
};

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta1hfcn008sq8iy6i2fe0bp",
    merchantId: "cmta1hf65008rq8iyfh7t6wpa",
    merchantName: "Artcolour",
    merchantSlug: "artcolour",
    expectedTitle: "Art & Colour Gift Card - €200",
    titleAfter: "Artcolour Gift Card",
    cardSlug: "artcolour-art-and-colour-gift-card-200",
    officialUrlBefore: "https://artcolour.gr/",
    officialUrlAfter: "https://www.artcolour.gr/category/doroepitages-gift-cards/",
    sourceError: "PAGE_HTTP_403",
    variant: {
      name: "Digital",
      type: "DIGITAL",
      minValue: "20",
      maxValue: "200",
      customValueAllowed: false,
      values: ["20", "50", "100", "200"],
      deliveryMethods: ["EMAIL"],
      redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
      validityMonths: null,
    },
    sources: [
      {
        url: "https://www.artcolour.gr/shop/doroepitages-gift-cards/gift-card-200/",
        assertions: [
          {
            label: "€200 gift-card product identity",
            pattern: /Δωροεπιταγή\s+Art\s*&\s*Colour\s*[–-]\s*200\s*€/iu,
          },
          {
            label: "recipient email delivery",
            pattern: /να\s+αποσταλεί\s+η\s+δωροεπιταγή\s+στο\s+email\s+τους/iu,
          },
          {
            label: "download alternative",
            pattern: /κατεβάστε\s+την\s+δωροεπιταγή\s+στη\s+συσκευή\s+σας/iu,
          },
          {
            label: "online and physical-store redemption",
            pattern:
              /μπορούν\s+να\s+χρησιμοποιηθούν\s+είτε\s+για\s+αγορές\s+στο\s+ηλεκτρονικό\s+κατάστημα\s+είτε\s+για\s+αγορές\s+από\s+(?:του|το)\s+φυσικό\s+κατάστημα/iu,
          },
          {
            label: "no expiration statement",
            pattern: /δεν\s+έχουν\s+ημερομηνία\s+λήξης/iu,
          },
        ],
      },
      {
        url: "https://www.artcolour.gr/category/doroepitages-gift-cards/",
        assertions: [
          { label: "€20 denomination", pattern: /Δωροεπιταγή\s+Art\s*&\s*Colour\s*[–-]\s*20\s*€/iu },
          { label: "€50 denomination", pattern: /Δωροεπιταγή\s+Art\s*&\s*Colour\s*[–-]\s*50\s*€/iu },
          { label: "€100 denomination", pattern: /Δωροεπιταγή\s+Art\s*&\s*Colour\s*[–-]\s*100\s*€/iu },
          { label: "€200 denomination", pattern: /Δωροεπιταγή\s+Art\s*&\s*Colour\s*[–-]\s*200\s*€/iu },
          {
            label: "category redemption scope",
            pattern: /τόσο\s+στο\s+φυσικό\s+κατάστημα\s+όσο\s+και\s+στο\s+eshop/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official product copy explicitly supports recipient-email delivery and download.",
      "Official product and category copy support online and physical-store redemption.",
      "The official category lists €20, €50, €100 and €200.",
      "The verified official gift-card category replaces the homepage URL.",
    ],
  },
  {
    cardId: "cmta1hm2i009gq8iy3vf9bzhy",
    merchantId: "cmta1hlx2009fq8iy6fwfj2v1",
    merchantName: "Bestpharmacy",
    merchantSlug: "bestpharmacy",
    expectedTitle: "Δωροκάρτα 50",
    titleAfter: "Bestpharmacy Gift Card",
    cardSlug: "bestpharmacy-δωροκαρτα-50",
    officialUrlBefore: "https://bestpharmacy.gr/",
    officialUrlAfter: "https://bestpharmacy.gr/el/gift-cards.html",
    sourceError: "PAGE_HTTP_403",
    variant: {
      name: "Digital",
      type: "DIGITAL",
      minValue: "10",
      maxValue: "50",
      customValueAllowed: false,
      values: ["10", "20", "50"],
      deliveryMethods: ["EMAIL"],
      redemptionChannels: ["ONLINE"],
      validityMonths: null,
    },
    sources: [
      {
        url: "https://bestpharmacy.gr/el/dorokarta-50.html",
        assertions: [
          { label: "€50 gift-card product identity", pattern: /Δωροκάρτα\s+50\s*€/iu },
          { label: "recipient-email field", pattern: /Email\s+Παραλήπτη/iu },
          {
            label: "recipient-email control",
            scope: "CONTROLS",
            pattern:
              /input\|name=am_giftcard_recipient_email\|type=text\|value=\|text=\|placeholder=Enter\s+Recipient\s+Email/iu,
          },
          {
            label: "scheduled-send control",
            scope: "CONTROLS",
            pattern: /input\|name=is_date_delivery\|type=radio\|value=1/iu,
          },
          {
            label: "online cart-code redemption",
            pattern: /εξαργύρωση\s+με\s+κωδικό\s+στο\s+καλάθι/iu,
          },
        ],
      },
      {
        url: "https://bestpharmacy.gr/el/gift-cards.html",
        assertions: [
          { label: "three gift-card items", pattern: /3\s+είδη/iu },
          { label: "€10 denomination", pattern: /Δωροκάρτα\s+10\s*€/iu },
          { label: "€20 denomination", pattern: /Δωροκάρτα\s+20\s*€/iu },
          { label: "€50 denomination", pattern: /Δωροκάρτα\s+50\s*€/iu },
        ],
      },
    ],
    evidence: [
      "Official product markup requires a recipient email and exposes send-now/send-later controls.",
      "Official product copy states redemption by code in the online cart.",
      "The official category lists exactly €10, €20 and €50.",
      "The verified official gift-card category replaces the homepage URL.",
    ],
  },
  {
    cardId: "cmta1f2jh000xq8iyzwanlt71",
    merchantId: "cmta1f2cv000wq8iyrguy8go3",
    merchantName: "PharmNet",
    merchantSlug: "pharmnet",
    expectedTitle: "Δωροεπιταγή 50 ευρώ",
    titleAfter: "PharmNet Gift Card",
    cardSlug: "pharmnet-δωροεπιταγη-50-ευρω",
    officialUrlBefore: "https://www.pharmnet.gr/",
    officialUrlAfter: "https://www.pharmnet.gr/el/gift-certificates",
    sourceError: "PAGE_HTTP_403",
    variant: {
      name: "Digital",
      type: "DIGITAL",
      minValue: "50",
      maxValue: "500",
      customValueAllowed: true,
      values: [],
      deliveryMethods: ["EMAIL"],
      redemptionChannels: ["ONLINE"],
      validityMonths: 12,
    },
    sources: [
      {
        url: "https://www.pharmnet.gr/el/gift-cards/",
        expectedFinalUrl: "https://www.pharmnet.gr/el/gift-certificates",
        assertions: [
          {
            label: "direct recipient email delivery",
            pattern:
              /Η\s+Δωροκάρτα\s+θα\s+σταλεί\s+απευθείας\s+στον\s+παραλήπτη[\s\S]{0,100}μέσω\s+e-mail/iu,
          },
          {
            label: "custom value range",
            pattern: /οποιαδήποτε\s+αξία\s+από\s+50\s*€\s+έως\s+και\s+500\s*€/iu,
          },
          {
            label: "twelve-month validity",
            pattern: /Ισχύει[\s\S]{0,80}για\s+12\s+μήνες/iu,
          },
          {
            label: "online code redemption",
            pattern: /κωδικό\s+της\s+δωροκάρτας\s+που\s+μπορεί\s+να\s+εξαργυρώσει\s+στο\s+pharmnet\.gr/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official gift-card copy explicitly states recipient email delivery.",
      "Official copy allows any value from €50 through €500.",
      "Official copy states online code redemption and twelve-month validity.",
      "The verified canonical official gift-card page replaces the homepage URL.",
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
    reasons: string[];
    existingVariantCount: number;
  }>;
};

type LiveEvidence = Array<{
  cardId: string;
  pages: Array<{
    requestedUrl: string;
    finalUrl: string;
    title: string;
    transport: "playwright-chrome";
    checks: Array<{ label: string; scope: AssertionScope; matched: string }>;
  }>;
}>;

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
      variant: VariantSpecification;
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
  liveEvidence: LiveEvidence;
  actions: Action[];
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function withoutVolatileTimestamp(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const stable = { ...(value as Record<string, unknown>) };
  delete stable.generatedAt;
  delete stable.appliedAt;
  return stable;
}

function writeImmutableJson(filePath: string, value: unknown) {
  if (fs.existsSync(filePath)) {
    const existing = readJson<unknown>(filePath);
    if (stableHash(withoutVolatileTimestamp(existing)) !== stableHash(withoutVolatileTimestamp(value))) {
      throw new Error(`Immutable report already exists with different contents: ${filePath}`);
    }
    return;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function decimal(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/gu, " ").trim();
}

function canonicalPageKey(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/u, "") || "/";
  return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
}

async function collectLiveEvidence(): Promise<LiveEvidence> {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      locale: "el-GR",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const evidence: LiveEvidence = [];
    for (const specification of SPECIFICATIONS) {
      const pages: LiveEvidence[number]["pages"] = [];
      for (const source of specification.sources) {
        const page = await context.newPage();
        try {
          const response = await page.goto(source.url, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          await page.waitForFunction(() => (document.body?.innerText.length || 0) > 1_000, null, {
            timeout: 20_000,
          });
          if (!response || response.status() !== 200) {
            throw new Error(
              `Official source returned HTTP ${response?.status() ?? "unknown"}: ${source.url}`,
            );
          }
          if (canonicalPageKey(page.url()) !== canonicalPageKey(source.expectedFinalUrl || source.url)) {
            throw new Error(`Official source redirected away from its approved page: ${source.url}`);
          }

          let body = "";
          let controls = "";
          const evidenceDeadline = Date.now() + 15_000;
          for (;;) {
            body = normalizeText(await page.locator("body").innerText());
            controls = normalizeText(
              await page.locator("input, textarea, select, option, label").evaluateAll((elements) =>
                elements
                  .map((element) => {
                    const input = element as HTMLInputElement;
                    return [
                      element.tagName.toLowerCase(),
                      `name=${element.getAttribute("name") || ""}`,
                      `type=${element.getAttribute("type") || ""}`,
                      `value=${element.getAttribute("value") || ""}`,
                      `text=${element.textContent?.trim() || ""}`,
                      `placeholder=${input.placeholder || ""}`,
                    ].join("|");
                  })
                  .join("\n"),
              ),
            );
            const complete = source.assertions.every((assertion) =>
              assertion.pattern.test((assertion.scope || "BODY") === "BODY" ? body : controls),
            );
            if (complete || Date.now() >= evidenceDeadline) break;
            await page.waitForTimeout(500);
          }

          const checks = source.assertions.map((assertion) => {
            const scope = assertion.scope || "BODY";
            const matched = (scope === "BODY" ? body : controls).match(assertion.pattern)?.[0];
            if (!matched) {
              throw new Error(`Missing live evidence "${assertion.label}": ${source.url}`);
            }
            return { label: assertion.label, scope, matched: normalizeText(matched) };
          });
          pages.push({
            requestedUrl: source.url,
            finalUrl: canonicalPageKey(page.url()),
            title: normalizeText(await page.title()),
            transport: "playwright-chrome",
            checks,
          });
        } finally {
          await page.close();
        }
      }
      evidence.push({ cardId: specification.cardId, pages });
    }
    return evidence;
  } finally {
    await browser.close();
  }
}

async function loadTargets(client: Pick<typeof prisma, "giftCard"> = prisma) {
  return client.giftCard.findMany({
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
      finding.finalUrl !== null ||
      finding.status !== "ERROR" ||
      !finding.reasons.includes(specification.sourceError) ||
      finding.existingVariantCount !== 0
    ) {
      throw new Error(`Evidence-report precondition failed for ${specification.cardId}.`);
    }
  }
}

function specificationComplete(card: TargetState, specification: Specification) {
  const variant = card.variants[0];
  const expectedValues = specification.variant.values.map(Number).sort((left, right) => left - right);
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
      variant?.name === specification.variant.name &&
      variant.type === specification.variant.type &&
      variant.currency === "EUR" &&
      decimal(variant.minValue) === specification.variant.minValue &&
      decimal(variant.maxValue) === specification.variant.maxValue &&
      variant.customValueAllowed === specification.variant.customValueAllowed &&
      variant.purchaseUrl === specification.officialUrlAfter &&
      variant.validityMonths === specification.variant.validityMonths &&
      variant.active &&
      JSON.stringify(actualValues) === JSON.stringify(expectedValues) &&
      JSON.stringify(variant.deliveries.map((item) => item.method).sort()) ===
        JSON.stringify([...specification.variant.deliveryMethods].sort()) &&
      JSON.stringify(variant.redemptions.map((item) => item.channel).sort()) ===
        JSON.stringify([...specification.variant.redemptionChannels].sort())
  );
}

function assertPendingPreconditions(card: TargetState, specification: Specification) {
  if (
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
    "expected",
    "value",
    "variant",
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
  assertSourceReport(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
  if (cards.length !== SPECIFICATIONS.length) throw new Error("A Playwright-verified target is missing.");
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pending = SPECIFICATIONS.filter((specification) => {
    const card = byId.get(specification.cardId);
    return !card || !specificationComplete(card, specification);
  });
  for (const specification of pending) {
    const card = byId.get(specification.cardId);
    if (!card) throw new Error(`Target ${specification.cardId} is missing.`);
    assertPendingPreconditions(card, specification);
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
    actions.push({
      type: "UPDATE_OFFICIAL_URL",
      actionId: `update-official-url:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expected: specification.officialUrlBefore,
      value: specification.officialUrlAfter,
      evidence: specification.evidence,
    });
    actions.push({
      type: "CREATE_VARIANT",
      actionId: `create-variant:${specification.cardId}`,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expectedTitleAfter: specification.titleAfter,
      officialUrlAfter: specification.officialUrlAfter,
      variant: specification.variant,
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

function assertPlanSemantics(plan: Plan) {
  if (plan.liveEvidenceFingerprint !== stableHash(plan.liveEvidence)) {
    throw new Error("Stored live-evidence fingerprint does not match its evidence payload.");
  }
  if (!Array.isArray(plan.liveEvidence) || plan.liveEvidence.length !== SPECIFICATIONS.length) {
    throw new Error("Stored live evidence does not cover the approved targets exactly once.");
  }
  const evidenceByCard = new Map(plan.liveEvidence.map((entry) => [entry.cardId, entry]));
  if (evidenceByCard.size !== SPECIFICATIONS.length) {
    throw new Error("Stored live evidence contains duplicate target entries.");
  }
  for (const specification of SPECIFICATIONS) {
    const entry = evidenceByCard.get(specification.cardId);
    if (!entry || !Array.isArray(entry.pages) || entry.pages.length !== specification.sources.length) {
      throw new Error(`Stored live evidence has incomplete pages for ${specification.cardId}.`);
    }
    for (const [index, source] of specification.sources.entries()) {
      const page = entry.pages[index];
      const expectedFinalUrl = canonicalPageKey(source.expectedFinalUrl || source.url);
      if (
        page.requestedUrl !== source.url ||
        page.finalUrl !== expectedFinalUrl ||
        page.transport !== "playwright-chrome" ||
        !page.title ||
        page.title !== normalizeText(page.title) ||
        !Array.isArray(page.checks) ||
        page.checks.length !== source.assertions.length
      ) {
        throw new Error(`Stored live page metadata is invalid for ${source.url}.`);
      }
      for (const [checkIndex, assertion] of source.assertions.entries()) {
        const check = page.checks[checkIndex];
        if (
          check.label !== assertion.label ||
          check.scope !== (assertion.scope || "BODY") ||
          !check.matched ||
          check.matched !== normalizeText(check.matched)
        ) {
          throw new Error(`Stored live evidence check is invalid for ${source.url}.`);
        }
      }
    }
  }
  if (plan.actionCount !== plan.actions.length) {
    throw new Error("Stored action count does not match the plan actions.");
  }
  const cardIds = [...new Set(plan.actions.map((action) => action.cardId))];
  if (plan.cardCount !== cardIds.length) {
    throw new Error("Stored card count does not match the plan actions.");
  }
  const specificationsByCard = new Map(SPECIFICATIONS.map((item) => [item.cardId, item]));
  for (const cardId of cardIds) {
    const specification = specificationsByCard.get(cardId);
    const actions = plan.actions.filter((action) => action.cardId === cardId);
    if (!specification || actions.length !== 3) {
      throw new Error(`Unexpected action group for ${cardId}.`);
    }
    const title = actions.find((action) => action.type === "UPDATE_CARD_TITLE");
    const url = actions.find((action) => action.type === "UPDATE_OFFICIAL_URL");
    const variant = actions.find((action) => action.type === "CREATE_VARIANT");
    if (
      !title ||
      title.actionId !== `update-title:${cardId}` ||
      title.merchantId !== specification.merchantId ||
      title.expected !== specification.expectedTitle ||
      title.value !== specification.titleAfter ||
      !Number.isFinite(new Date(title.expectedUpdatedAt).getTime()) ||
      JSON.stringify(title.evidence) !== JSON.stringify(specification.evidence) ||
      !url ||
      url.actionId !== `update-official-url:${cardId}` ||
      url.merchantId !== specification.merchantId ||
      url.expected !== specification.officialUrlBefore ||
      url.value !== specification.officialUrlAfter ||
      JSON.stringify(url.evidence) !== JSON.stringify(specification.evidence) ||
      !variant ||
      variant.actionId !== `create-variant:${cardId}` ||
      variant.merchantId !== specification.merchantId ||
      variant.expectedTitleAfter !== specification.titleAfter ||
      variant.officialUrlAfter !== specification.officialUrlAfter ||
      JSON.stringify(variant.variant) !== JSON.stringify(specification.variant) ||
      JSON.stringify(variant.evidence) !== JSON.stringify(specification.evidence)
    ) {
      throw new Error(`Stored actions do not match the approved specification for ${cardId}.`);
    }
  }
}

function assertPlanRequest(plan: Plan, source: SourceReport) {
  if (plan.version !== VERSION || plan.mode !== "PREVIEW") {
    throw new Error("Stored plan version or mode does not match this script.");
  }
  if (plan.sourceReportId !== source.reportId || plan.sourceReportId !== SOURCE_REPORT_ID) {
    throw new Error("Stored plan is not bound to the immutable source report.");
  }
  const hashMaterial = {
    version: plan.version,
    mode: plan.mode,
    sourceReportId: plan.sourceReportId,
    targetFingerprint: plan.targetFingerprint,
    liveEvidenceFingerprint: plan.liveEvidenceFingerprint,
    cardCount: plan.cardCount,
    actionCount: plan.actionCount,
    liveEvidence: plan.liveEvidence,
    actions: plan.actions,
  };
  if (stableHash(hashMaterial) !== plan.planId) {
    throw new Error("Stored plan contents do not match its plan ID.");
  }
  assertPlanSemantics(plan);
  if (!REQUESTED_PLAN_ID) throw new Error("This operation requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function applyPlan(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
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
      const transactionCards = await loadTargets(tx);
      if (fingerprint(transactionCards) !== plan.targetFingerprint) {
        throw new Error("Target state changed before the transaction; refusing to apply.");
      }
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
        const current = await tx.giftCard.findUnique({
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
          !current ||
          current.merchantId !== action.merchantId ||
          current.merchant.name !== specification.merchantName ||
          current.merchant.slug !== specification.merchantSlug ||
          current.title !== action.expectedTitleAfter ||
          current.slug !== specification.cardSlug ||
          current.officialUrl !== action.officialUrlAfter ||
          current.status !== "ACTIVE" ||
          variantCount !== 0
        ) {
          throw new Error(`Variant precondition failed for ${action.cardId}.`);
        }
        const variant = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: action.variant.name,
            type: action.variant.type,
            currency: "EUR",
            minValue: action.variant.minValue,
            maxValue: action.variant.maxValue,
            customValueAllowed: action.variant.customValueAllowed,
            purchaseUrl: action.officialUrlAfter,
            validityMonths: action.variant.validityMonths,
            values: action.variant.values.length
              ? { create: action.variant.values.map((value) => ({ value })) }
              : undefined,
            deliveries: {
              create: action.variant.deliveryMethods.map((method) => ({ method })),
            },
            redemptions: {
              create: action.variant.redemptionChannels.map((channel) => ({ channel })),
            },
          },
          select: { id: true },
        });
        applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: variant.id });
      }
      const finalCards = await loadTargets(tx);
      const finalById = new Map(finalCards.map((card) => [card.id, card]));
      for (const specification of SPECIFICATIONS) {
        const finalCard = finalById.get(specification.cardId);
        if (!finalCard || !specificationComplete(finalCard, specification)) {
          throw new Error(`Atomic postcondition failed for ${specification.cardId}.`);
        }
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
  writeImmutableJson(
    path.join(REPORT_DIR, `playwright-error-denominations-v5-apply-${plan.planId.slice(0, 16)}.json`),
    report,
  );
  return report;
}

async function postAudit(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
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
  writeImmutableJson(
    path.join(
      REPORT_DIR,
      `playwright-error-denominations-v5-post-audit-${plan.planId.slice(0, 16)}.json`,
    ),
    report,
  );
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
    console.log("Dorokartes Playwright Error Denominations v5 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan, source);
    console.log("Dorokartes Playwright Error Denominations v5 — POST-AUDIT");
    console.log(`Checked cards: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  writeImmutableJson(
    path.join(REPORT_DIR, `playwright-error-denominations-v5-plan-${plan.planId.slice(0, 16)}.json`),
    plan,
  );
  console.log("Dorokartes Playwright Error Denominations v5 — PREVIEW");
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
