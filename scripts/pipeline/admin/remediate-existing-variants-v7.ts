import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { prisma } from "../../../lib/prisma";

const VERSION = 7 as const;
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
const V2_PLAN = path.join(
  REPORT_DIR,
  "denomination-delivery-remediation-v2-plan-f3aca3c7d626eedc.json",
);
const V2_APPLY = path.join(REPORT_DIR, "denomination-delivery-remediation-v2-apply.json");
const V2_PLAN_ID = "f3aca3c7d626eedc32f5a128ab4e1c3fcd672ae80641ede87ebfe9637cb5fbf4";
const PLAN_JSON = path.join(REPORT_DIR, "existing-variant-enrichment-v7-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "existing-variant-enrichment-v7-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "existing-variant-enrichment-v7-apply.json");
const POST_AUDIT_JSON = path.join(
  REPORT_DIR,
  "existing-variant-enrichment-v7-post-audit.json",
);

type SourceSpecification = {
  url: string;
  titlePattern: RegExp;
  assertions: Array<{ label: string; pattern: RegExp }>;
};

type ValueIdentity = { id: string; value: string };
type DeliveryIdentity = { id: string; method: "EMAIL" };
type RedemptionIdentity = { id: string; channel: "ONLINE" | "PHYSICAL_STORE" };

type VariantFields = {
  name: "Digital";
  type: "DIGITAL";
  currency: "EUR";
  minValue: string;
  maxValue: string;
  customValueAllowed: false;
  purchaseUrl: string;
  validityMonths: number | null;
  validityText: null;
  active: true;
};

type ExistingVariantSpecification = VariantFields & {
  id: string;
  values: ValueIdentity[];
  deliveries: DeliveryIdentity[];
  redemptions: RedemptionIdentity[];
};

type FinalVariantSpecification = VariantFields & {
  finalValues: string[];
  valuesToAdd: string[];
};

type SourceFindingExpectation = {
  title: string;
  finalUrl: string;
  status: "REVIEW" | "SUPPORTED_AS_IS";
  reasons: string[];
  existingVariantCount: number;
};

type Specification = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  title: string;
  cardSlug: string;
  expectedVerificationStatus: "NEEDS_REVIEW" | "VERIFIED";
  officialUrlBefore: string;
  officialUrlAfter: string;
  sourceFinding: SourceFindingExpectation;
  existingVariant: ExistingVariantSpecification;
  finalVariant: FinalVariantSpecification;
  sources: SourceSpecification[];
  evidence: string[];
  lineagePlanId: string | null;
};

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta4yw6q002xsciynztac1t7",
    merchantId: "cmta4yw0c002wsciyir3okmhf",
    merchantName: "Msystems",
    merchantSlug: "msystems-δωροκαρτα-10e",
    title: "Msystems Gift Card",
    cardSlug: "msystems-δωροκαρτα-10e-msystems-δωροκαρτα-10e-δωροκαρτες",
    expectedVerificationStatus: "VERIFIED",
    officialUrlBefore: "https://www.msystems.gr/gifcards/msystems-giftcard-10e",
    officialUrlAfter: "https://www.msystems.gr/gifcards",
    sourceFinding: {
      title: "Msystems Δωροκάρτα 10e | Δωροκάρτες",
      finalUrl: "https://www.msystems.gr/gifcards/msystems-giftcard-10e",
      status: "SUPPORTED_AS_IS",
      reasons: ["DELIVERY_TYPE_UNRESOLVED"],
      existingVariantCount: 0,
    },
    existingVariant: {
      id: "cmtqxzk71000c6oiyzwws7bee",
      name: "Digital",
      type: "DIGITAL",
      currency: "EUR",
      minValue: "10",
      maxValue: "10",
      customValueAllowed: false,
      purchaseUrl: "https://www.msystems.gr/gifcards/msystems-giftcard-10e",
      validityMonths: 12,
      validityText: null,
      active: true,
      values: [{ id: "cmtqxzk8b000d6oiy3kagj88c", value: "10" }],
      deliveries: [],
      redemptions: [
        { id: "cmtqxzk9m000e6oiyon1tmcx3", channel: "ONLINE" },
        { id: "cmtqxzk9m000f6oiydcf846om", channel: "PHYSICAL_STORE" },
      ],
    },
    finalVariant: {
      name: "Digital",
      type: "DIGITAL",
      currency: "EUR",
      minValue: "10",
      maxValue: "150",
      customValueAllowed: false,
      purchaseUrl: "https://www.msystems.gr/gifcards",
      validityMonths: 12,
      validityText: null,
      active: true,
      finalValues: ["10", "20", "30", "50", "100", "150"],
      valuesToAdd: ["20", "30", "50", "100", "150"],
    },
    sources: [
      {
        url: "https://www.msystems.gr/gifcards/msystems-giftcard-10e",
        titlePattern: /^Msystems\s+Δωροκάρτα\s+10e\s+\|\s+Δωροκάρτες\s+\|\s+Msystems$/iu,
        assertions: [
          {
            label: "electronic-only form",
            pattern: /Η\s+Δωροκάρτα\s+παρέχεται\s+μόνο\s+σε\s+ηλεκτρονική\s+μορφή/iu,
          },
          {
            label: "online and physical-store redemption",
            pattern: /στο\s+φυσικό\s+ή\s+διαδικτυακό\s+κατάστημα\s+της\s+Msystems/iu,
          },
          {
            label: "one-year validity",
            pattern: /για\s+χρονική\s+περίοδο\s+ενός\s+έτους\s+από\s+την\s+ημερομηνία\s+αγοράς\s+της/iu,
          },
        ],
      },
      {
        url: "https://www.msystems.gr/gifcards",
        titlePattern: /^Δωροκάρτες\s+\|\s+Msystems$/iu,
        assertions: [
          {
            label: "exact six-product manufacturer count",
            pattern: /Κατασκευαστής\s+Msystems\s+6\b/iu,
          },
          {
            label: "€10 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+10€[\s\S]{0,100}10,00\s*€/iu,
          },
          {
            label: "€20 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+20€[\s\S]{0,100}20,00\s*€/iu,
          },
          {
            label: "€30 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+30€[\s\S]{0,100}30,00\s*€/iu,
          },
          {
            label: "€50 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+50€[\s\S]{0,100}50,00\s*€/iu,
          },
          {
            label: "€100 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+100€[\s\S]{0,100}100,00\s*€/iu,
          },
          {
            label: "€150 denomination",
            pattern: /Msystems\s+Δωροκάρτα\s+150€[\s\S]{0,100}150,00\s*€/iu,
          },
        ],
      },
    ],
    evidence: [
      "The applied v2 plan created and verified the current €10 Digital variant.",
      "Current official product copy still states electronic-only form, online/store redemption and one-year validity.",
      "The official gift-card category lists exactly six Msystems cards: €10, €20, €30, €50, €100 and €150.",
      "No EMAIL or SMS delivery method is added: the contact wording refers to redemption OTP, not gift-card delivery.",
      "The existing variant, value and redemption IDs are preserved; only missing values and general URL fields are added.",
    ],
    lineagePlanId: V2_PLAN_ID,
  },
  {
    cardId: "cmta1jdvx00gqq8iy4767yu90",
    merchantId: "cmta1jdpf00gpq8iyjay8pz2w",
    merchantName: "Secrets of Beauty",
    merchantSlug: "secretsofbeauty",
    title: "Secrets of Beauty Gift Card",
    cardSlug: "secretsofbeauty-δωροκαρτα-300-secrets-of-beauty-θεσσαλονικη",
    expectedVerificationStatus: "NEEDS_REVIEW",
    officialUrlBefore: "https://secretsofbeauty.gr/doroepitages-spa/dorokarta-300e",
    officialUrlAfter: "https://secretsofbeauty.gr/doroepitages-spa",
    sourceFinding: {
      title: "Secrets of Beauty Gift Card",
      finalUrl: "https://secretsofbeauty.gr/doroepitages-spa/dorokarta-300e",
      status: "REVIEW",
      reasons: [
        "URL_DENOMINATION_ONLY",
        "TITLE_AMOUNT_NOT_CONFIRMED_ON_PAGE",
        "CURRENCY_UNRESOLVED",
      ],
      existingVariantCount: 1,
    },
    existingVariant: {
      id: "cmtn5x8jc000blsiycqwempns",
      name: "Digital",
      type: "DIGITAL",
      currency: "EUR",
      minValue: "300",
      maxValue: "300",
      customValueAllowed: false,
      purchaseUrl: "https://secretsofbeauty.gr/doroepitages-spa/dorokarta-300e",
      validityMonths: null,
      validityText: null,
      active: true,
      values: [{ id: "cmtn5x8le000clsiyp1z0qwsc", value: "300" }],
      deliveries: [{ id: "cmtn5x8nf000dlsiy9095gg4r", method: "EMAIL" }],
      redemptions: [
        { id: "cmtn5x8q9000elsiyu3fuwvpo", channel: "ONLINE" },
        { id: "cmtn5x8q9000flsiybyn886ee", channel: "PHYSICAL_STORE" },
      ],
    },
    finalVariant: {
      name: "Digital",
      type: "DIGITAL",
      currency: "EUR",
      minValue: "40",
      maxValue: "300",
      customValueAllowed: false,
      purchaseUrl: "https://secretsofbeauty.gr/doroepitages-spa",
      validityMonths: 6,
      validityText: null,
      active: true,
      finalValues: ["40", "70", "100", "200", "300"],
      valuesToAdd: ["40", "70", "100", "200"],
    },
    sources: [
      {
        url: "https://secretsofbeauty.gr/doroepitages-spa/dorokarta-300e",
        titlePattern: /^Δωροκάρτα\s+300€\s+\|\s+Secrets\s+of\s+Beauty\s+\|\s+Θεσσαλονίκη$/iu,
        assertions: [
          { label: "recipient email field", pattern: /Email\s+παραλήπτη/iu },
          {
            label: "scheduled gift-send field",
            pattern: /Ημερομηνία\s+αποστολής\s+δώρου/iu,
          },
          {
            label: "online and venue redemption",
            pattern: /είτε\s+online\s+είτε\s+στο\s+χώρο\s+μας/iu,
          },
          {
            label: "online redemption instruction",
            pattern: /Μέσα\s+από\s+το\s+e-shop/iu,
          },
          {
            label: "physical venue redemption instruction",
            pattern: /Στο\s+χώρο\s+του\s+Secrets\s+of\s+Beauty/iu,
          },
          {
            label: "six-month validity",
            pattern: /Ισχύει\s+για\s+6\s+μήνες\s+από\s+την\s+ημερομηνία\s+αγοράς/iu,
          },
        ],
      },
      {
        url: "https://secretsofbeauty.gr/doroepitages-spa",
        titlePattern: /^Δωροεπιταγές\s+Spa\s+Archives\s+\|\s+secretsofbeauty$/iu,
        assertions: [
          {
            label: "custom amount option present but unbounded",
            pattern: /Διάλεξε\s+δικό\s+σου\s+ποσό/iu,
          },
          {
            label: "€40 fixed denomination",
            pattern: /Δωροκάρτα\s+40€\s+40\.00\s*€/iu,
          },
          {
            label: "€70 fixed denomination",
            pattern: /Δωροκάρτα\s+70€\s+70\.00\s*€/iu,
          },
          {
            label: "€100 fixed denomination",
            pattern: /Δωροκάρτα\s+100€\s+100\.00\s*€/iu,
          },
          {
            label: "€200 fixed denomination",
            pattern: /Δωροκάρτα\s+200€\s+200\.00\s*€/iu,
          },
          {
            label: "€300 fixed denomination",
            pattern: /Δωροκάρτα\s+300€\s+300\.00\s*€/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official product controls and copy preserve recipient-email delivery and scheduled sending.",
      "Official product copy preserves online and physical-venue redemption and adds six-month validity.",
      "The official category lists fixed €40, €70, €100, €200 and €300 gift cards.",
      "The separate custom-amount option is not modeled because the official page exposes no auditable bounds.",
      "The existing variant, €300 value, delivery and redemption IDs are preserved; no delete or recreate is permitted.",
    ],
    lineagePlanId: null,
  },
];

type SourceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: Array<{
    cardId: string;
    merchantId: string;
    merchantName: string;
    title: string;
    officialUrl: string;
    finalUrl: string | null;
    status: string;
    reasons: string[];
    existingVariantCount: number;
  }>;
};

type V2Plan = {
  planId: string;
  sourceReportId: string;
  actions: Array<{ actionId: string; cardId: string }>;
};

type V2Apply = {
  planId: string;
  applied: Array<{ actionId: string }>;
};

type LiveEvidence = Array<{
  cardId: string;
  pages: Array<{
    requestedUrl: string;
    finalUrl: string;
    title: string;
    transport: "playwright-chrome";
    checks: Array<{ label: string; matched: string }>;
  }>;
}>;

type TargetState = Awaited<ReturnType<typeof loadTargets>>[number];

type Action =
  | {
      type: "UPDATE_OFFICIAL_URL";
      actionId: string;
      cardId: string;
      merchantId: string;
      variantId: string;
      expected: string;
      value: string;
      expectedUpdatedAt: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_VARIANT_FIELDS";
      actionId: string;
      cardId: string;
      merchantId: string;
      variantId: string;
      before: VariantFields;
      after: VariantFields;
      expectedUpdatedAt: string;
      evidence: string[];
    }
  | {
      type: "ADD_VARIANT_VALUES";
      actionId: string;
      cardId: string;
      merchantId: string;
      variantId: string;
      expectedExistingValues: ValueIdentity[];
      valuesToAdd: string[];
      finalValues: string[];
      evidence: string[];
    };

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  lineagePlanIds: string[];
  targetFingerprint: string;
  liveEvidenceFingerprint: string;
  planId: string;
  cardCount: number;
  actionCount: number;
  liveEvidence: LiveEvidence;
  actions: Action[];
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error("Required input is missing: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function withoutVolatileTimestamp(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const stable = { ...(value as Record<string, unknown>) };
  delete stable.generatedAt;
  delete stable.appliedAt;
  return stable;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function writeImmutableJson(filePath: string, value: unknown) {
  if (fs.existsSync(filePath)) {
    const existing = readJson<unknown>(filePath);
    if (stableHash(withoutVolatileTimestamp(existing)) !== stableHash(withoutVolatileTimestamp(value))) {
      throw new Error("Immutable report already exists with different contents: " + filePath);
    }
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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
  return parsed.protocol + "//" + host + pathname + parsed.search;
}

function variantFields(variant: ExistingVariantSpecification | FinalVariantSpecification): VariantFields {
  return {
    name: variant.name,
    type: variant.type,
    currency: variant.currency,
    minValue: variant.minValue,
    maxValue: variant.maxValue,
    customValueAllowed: variant.customValueAllowed,
    purchaseUrl: variant.purchaseUrl,
    validityMonths: variant.validityMonths,
    validityText: variant.validityText,
    active: variant.active,
  };
}

function assertSourceReport(source: SourceReport) {
  if (source.mode !== "PREVIEW" || source.reportId !== SOURCE_REPORT_ID) {
    throw new Error("The immutable denomination report does not match the approved source.");
  }
  for (const specification of SPECIFICATIONS) {
    const matches = source.findings.filter((item) => item.cardId === specification.cardId);
    const finding = matches[0];
    if (
      matches.length !== 1 ||
      !finding ||
      finding.merchantId !== specification.merchantId ||
      finding.merchantName !== specification.merchantName ||
      finding.title !== specification.sourceFinding.title ||
      finding.officialUrl !== specification.officialUrlBefore ||
      finding.finalUrl !== specification.sourceFinding.finalUrl ||
      finding.status !== specification.sourceFinding.status ||
      JSON.stringify(finding.reasons) !== JSON.stringify(specification.sourceFinding.reasons) ||
      finding.existingVariantCount !== specification.sourceFinding.existingVariantCount
    ) {
      throw new Error("Evidence-report precondition failed for " + specification.cardId + ".");
    }
  }
}

function assertV2Lineage() {
  const plan = readJson<V2Plan>(V2_PLAN);
  const apply = readJson<V2Apply>(V2_APPLY);
  const requiredActionIds = [
    "update-card-title:cmta4yw6q002xsciynztac1t7",
    "create-digital-variant:cmta4yw6q002xsciynztac1t7",
  ];
  if (
    plan.planId !== V2_PLAN_ID ||
    plan.sourceReportId !== SOURCE_REPORT_ID ||
    apply.planId !== V2_PLAN_ID ||
    requiredActionIds.some(
      (actionId) =>
        !plan.actions.some(
          (action) =>
            action.actionId === actionId && action.cardId === "cmta4yw6q002xsciynztac1t7",
        ) || !apply.applied.some((action) => action.actionId === actionId),
    )
  ) {
    throw new Error("The applied v2 Msystems lineage does not match the approved records.");
  }
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
          await page.waitForFunction(() => (document.body?.innerText.length || 0) > 700, null, {
            timeout: 20_000,
          });
          if (!response || response.status() !== 200) {
            throw new Error(
              "Official source returned HTTP " +
                (response?.status() ?? "unknown") +
                ": " +
                source.url,
            );
          }
          if (canonicalPageKey(page.url()) !== canonicalPageKey(source.url)) {
            throw new Error("Official source redirected away from its approved page: " + source.url);
          }
          let body = "";
          const deadline = Date.now() + 15_000;
          for (;;) {
            body = normalizeText(await page.locator("body").innerText());
            if (source.assertions.every((assertion) => assertion.pattern.test(body))) break;
            if (Date.now() >= deadline) break;
            await page.waitForTimeout(500);
          }
          const title = normalizeText(await page.title());
          if (!source.titlePattern.test(title)) {
            throw new Error("Official source title does not match its approved identity: " + source.url);
          }
          const checks = source.assertions.map((assertion) => {
            const matched = body.match(assertion.pattern)?.[0];
            if (!matched) {
              throw new Error("Missing live evidence " + assertion.label + ": " + source.url);
            }
            return { label: assertion.label, matched: normalizeText(matched) };
          });
          pages.push({
            requestedUrl: source.url,
            finalUrl: canonicalPageKey(page.url()),
            title,
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
      verificationStatus: true,
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
          validityText: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          values: {
            orderBy: { value: "asc" },
            select: { id: true, value: true },
          },
          deliveries: {
            orderBy: { method: "asc" },
            select: { id: true, method: true },
          },
          redemptions: {
            orderBy: { channel: "asc" },
            select: { id: true, channel: true },
          },
        },
      },
    },
  });
}

function comparableVariant(variant: TargetState["variants"][number]) {
  return {
    id: variant.id,
    name: variant.name,
    type: variant.type,
    currency: variant.currency,
    minValue: decimal(variant.minValue),
    maxValue: decimal(variant.maxValue),
    customValueAllowed: variant.customValueAllowed,
    purchaseUrl: variant.purchaseUrl,
    validityMonths: variant.validityMonths,
    validityText: variant.validityText,
    active: variant.active,
    values: variant.values.map((item) => ({ id: item.id, value: decimal(item.value)! })),
    deliveries: variant.deliveries.map((item) => ({ id: item.id, method: item.method })),
    redemptions: variant.redemptions.map((item) => ({ id: item.id, channel: item.channel })),
  };
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
    verificationStatus: card.verificationStatus,
    updatedAt: card.updatedAt.toISOString(),
    variants: card.variants.map((variant) => ({
      ...comparableVariant(variant),
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    })),
  }));
}

function fingerprint(cards: TargetState[]) {
  return stableHash(targetSnapshot(cards));
}

function sortedNumbers(values: Array<string | number>) {
  return values.map(Number).sort((left, right) => left - right);
}

function existingVariantMatches(
  variant: TargetState["variants"][number],
  expected: ExistingVariantSpecification,
) {
  return JSON.stringify(comparableVariant(variant)) === JSON.stringify(expected);
}

function specificationComplete(card: TargetState, specification: Specification) {
  const variant = card.variants[0];
  if (
    card.merchantId !== specification.merchantId ||
    card.merchant.name !== specification.merchantName ||
    card.merchant.slug !== specification.merchantSlug ||
    card.title !== specification.title ||
    card.slug !== specification.cardSlug ||
    card.officialUrl !== specification.officialUrlAfter ||
    card.status !== "ACTIVE" ||
    card.verificationStatus !== specification.expectedVerificationStatus ||
    card.variants.length !== 1 ||
    !variant ||
    variant.id !== specification.existingVariant.id
  ) {
    return false;
  }
  const final = specification.finalVariant;
  if (
    variant.name !== final.name ||
    variant.type !== final.type ||
    variant.currency !== final.currency ||
    decimal(variant.minValue) !== final.minValue ||
    decimal(variant.maxValue) !== final.maxValue ||
    variant.customValueAllowed !== final.customValueAllowed ||
    variant.purchaseUrl !== final.purchaseUrl ||
    variant.validityMonths !== final.validityMonths ||
    variant.validityText !== final.validityText ||
    variant.active !== final.active ||
    JSON.stringify(sortedNumbers(variant.values.map((item) => String(item.value)))) !==
      JSON.stringify(sortedNumbers(final.finalValues)) ||
    JSON.stringify(variant.deliveries.map((item) => ({ id: item.id, method: item.method }))) !==
      JSON.stringify(specification.existingVariant.deliveries) ||
    JSON.stringify(variant.redemptions.map((item) => ({ id: item.id, channel: item.channel }))) !==
      JSON.stringify(specification.existingVariant.redemptions)
  ) {
    return false;
  }
  return specification.existingVariant.values.every((expected) =>
    variant.values.some(
      (actual) => actual.id === expected.id && decimal(actual.value) === expected.value,
    ),
  );
}

function assertPendingPreconditions(card: TargetState, specification: Specification) {
  if (
    card.merchantId !== specification.merchantId ||
    card.merchant.name !== specification.merchantName ||
    card.merchant.slug !== specification.merchantSlug ||
    card.title !== specification.title ||
    card.slug !== specification.cardSlug ||
    card.officialUrl !== specification.officialUrlBefore ||
    card.status !== "ACTIVE" ||
    card.verificationStatus !== specification.expectedVerificationStatus ||
    card.variants.length !== 1 ||
    !existingVariantMatches(card.variants[0], specification.existingVariant)
  ) {
    throw new Error("Catalog precondition failed for " + specification.cardId + ".");
  }
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.map((item) => (typeof item === "object" ? JSON.stringify(item) : item)).join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

function writeCsv(actions: Action[]) {
  const headers = [
    "type",
    "actionId",
    "cardId",
    "merchantId",
    "variantId",
    "expected",
    "value",
    "before",
    "after",
    "expectedExistingValues",
    "valuesToAdd",
    "finalValues",
    "evidence",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) => {
      const row: Record<string, unknown> = { ...action };
      return headers.map((header) => csvEscape(row[header])).join(",");
    }),
  ];
  fs.writeFileSync(PLAN_CSV, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

async function buildPlan(source: SourceReport): Promise<Plan> {
  assertSourceReport(source);
  assertV2Lineage();
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
  if (cards.length !== SPECIFICATIONS.length) throw new Error("An update-only target is missing.");
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pending = SPECIFICATIONS.filter((specification) => {
    const card = byId.get(specification.cardId);
    return !card || !specificationComplete(card, specification);
  });
  for (const specification of pending) {
    const card = byId.get(specification.cardId);
    if (!card) throw new Error("Target is missing: " + specification.cardId);
    assertPendingPreconditions(card, specification);
  }
  const actions: Action[] = [];
  for (const specification of pending) {
    const card = byId.get(specification.cardId)!;
    const variant = card.variants[0];
    actions.push({
      type: "UPDATE_OFFICIAL_URL",
      actionId: "update-official-url:" + specification.cardId,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      variantId: variant.id,
      expected: specification.officialUrlBefore,
      value: specification.officialUrlAfter,
      expectedUpdatedAt: card.updatedAt.toISOString(),
      evidence: specification.evidence,
    });
    actions.push({
      type: "UPDATE_VARIANT_FIELDS",
      actionId: "update-variant-fields:" + specification.cardId,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      variantId: variant.id,
      before: variantFields(specification.existingVariant),
      after: variantFields(specification.finalVariant),
      expectedUpdatedAt: variant.updatedAt.toISOString(),
      evidence: specification.evidence,
    });
    actions.push({
      type: "ADD_VARIANT_VALUES",
      actionId: "add-variant-values:" + specification.cardId,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      variantId: variant.id,
      expectedExistingValues: specification.existingVariant.values,
      valuesToAdd: specification.finalVariant.valuesToAdd,
      finalValues: specification.finalVariant.finalValues,
      evidence: specification.evidence,
    });
  }
  const lineagePlanIds = SPECIFICATIONS.flatMap((item) =>
    item.lineagePlanId ? [item.lineagePlanId] : [],
  );
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    lineagePlanIds,
    targetFingerprint: fingerprint(cards),
    liveEvidenceFingerprint: stableHash(liveEvidence),
    cardCount: pending.length,
    actionCount: actions.length,
    liveEvidence,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(material) };
}

function assertLiveEvidence(plan: Plan) {
  if (plan.liveEvidenceFingerprint !== stableHash(plan.liveEvidence)) {
    throw new Error("Stored live-evidence fingerprint does not match its payload.");
  }
  if (!Array.isArray(plan.liveEvidence) || plan.liveEvidence.length !== SPECIFICATIONS.length) {
    throw new Error("Stored live evidence does not cover the approved targets exactly once.");
  }
  const byCard = new Map(plan.liveEvidence.map((entry) => [entry.cardId, entry]));
  if (byCard.size !== SPECIFICATIONS.length) {
    throw new Error("Stored live evidence contains duplicate target entries.");
  }
  for (const specification of SPECIFICATIONS) {
    const entry = byCard.get(specification.cardId);
    if (!entry || entry.pages.length !== specification.sources.length) {
      throw new Error("Stored live evidence has incomplete pages for " + specification.cardId + ".");
    }
    for (const [index, source] of specification.sources.entries()) {
      const page = entry.pages[index];
      if (
        page.requestedUrl !== source.url ||
        page.finalUrl !== canonicalPageKey(source.url) ||
        page.transport !== "playwright-chrome" ||
        !page.title ||
        page.title !== normalizeText(page.title) ||
        !source.titlePattern.test(page.title) ||
        page.checks.length !== source.assertions.length
      ) {
        throw new Error("Stored live page metadata is invalid for " + source.url + ".");
      }
      for (const [checkIndex, assertion] of source.assertions.entries()) {
        const check = page.checks[checkIndex];
        if (
          check.label !== assertion.label ||
          !check.matched ||
          check.matched !== normalizeText(check.matched) ||
          !assertion.pattern.test(check.matched)
        ) {
          throw new Error("Stored live evidence check is invalid for " + source.url + ".");
        }
      }
    }
  }
}

function assertPlanSemantics(plan: Plan) {
  assertLiveEvidence(plan);
  if (JSON.stringify(plan.lineagePlanIds) !== JSON.stringify([V2_PLAN_ID])) {
    throw new Error("Stored lineage IDs do not match the approved lineage.");
  }
  if (plan.actionCount !== plan.actions.length) {
    throw new Error("Stored action count does not match the plan actions.");
  }
  const cardIds = [...new Set(plan.actions.map((action) => action.cardId))];
  if (plan.cardCount !== cardIds.length) {
    throw new Error("Stored card count does not match the plan actions.");
  }
  const expectedIds = SPECIFICATIONS.filter((item) => cardIds.includes(item.cardId)).flatMap(
    (item) => [
      "update-official-url:" + item.cardId,
      "update-variant-fields:" + item.cardId,
      "add-variant-values:" + item.cardId,
    ],
  );
  if (JSON.stringify(plan.actions.map((action) => action.actionId)) !== JSON.stringify(expectedIds)) {
    throw new Error("Stored action ordering does not match the approved specifications.");
  }
  for (const specification of SPECIFICATIONS.filter((item) => cardIds.includes(item.cardId))) {
    const actions = plan.actions.filter((action) => action.cardId === specification.cardId);
    const url = actions.find((action) => action.type === "UPDATE_OFFICIAL_URL");
    const fields = actions.find((action) => action.type === "UPDATE_VARIANT_FIELDS");
    const values = actions.find((action) => action.type === "ADD_VARIANT_VALUES");
    if (
      actions.length !== 3 ||
      !url ||
      url.merchantId !== specification.merchantId ||
      url.variantId !== specification.existingVariant.id ||
      url.expected !== specification.officialUrlBefore ||
      url.value !== specification.officialUrlAfter ||
      !Number.isFinite(new Date(url.expectedUpdatedAt).getTime()) ||
      JSON.stringify(url.evidence) !== JSON.stringify(specification.evidence) ||
      !fields ||
      fields.merchantId !== specification.merchantId ||
      fields.variantId !== specification.existingVariant.id ||
      JSON.stringify(fields.before) !== JSON.stringify(variantFields(specification.existingVariant)) ||
      JSON.stringify(fields.after) !== JSON.stringify(variantFields(specification.finalVariant)) ||
      !Number.isFinite(new Date(fields.expectedUpdatedAt).getTime()) ||
      JSON.stringify(fields.evidence) !== JSON.stringify(specification.evidence) ||
      !values ||
      values.merchantId !== specification.merchantId ||
      values.variantId !== specification.existingVariant.id ||
      JSON.stringify(values.expectedExistingValues) !==
        JSON.stringify(specification.existingVariant.values) ||
      JSON.stringify(values.valuesToAdd) !==
        JSON.stringify(specification.finalVariant.valuesToAdd) ||
      JSON.stringify(values.finalValues) !==
        JSON.stringify(specification.finalVariant.finalValues) ||
      JSON.stringify(values.evidence) !== JSON.stringify(specification.evidence)
    ) {
      throw new Error(
        "Stored actions do not match the approved specification for " + specification.cardId + ".",
      );
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
  const material = {
    version: plan.version,
    mode: plan.mode,
    sourceReportId: plan.sourceReportId,
    lineagePlanIds: plan.lineagePlanIds,
    targetFingerprint: plan.targetFingerprint,
    liveEvidenceFingerprint: plan.liveEvidenceFingerprint,
    cardCount: plan.cardCount,
    actionCount: plan.actionCount,
    liveEvidence: plan.liveEvidence,
    actions: plan.actions,
  };
  if (stableHash(material) !== plan.planId) {
    throw new Error("Stored plan contents do not match its plan ID.");
  }
  assertPlanSemantics(plan);
  if (!REQUESTED_PLAN_ID) {
    throw new Error("This operation requires --plan-id=<preview planId>.");
  }
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function assertValuesReadyForAddition(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  specification: Specification,
  action: Extract<Action, { type: "ADD_VARIANT_VALUES" }>,
) {
  const card = await tx.giftCard.findUnique({
    where: { id: action.cardId },
    select: {
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      merchant: { select: { name: true, slug: true } },
      variants: {
        where: { id: action.variantId },
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
          validityText: true,
          active: true,
          values: { orderBy: { value: "asc" }, select: { id: true, value: true } },
          deliveries: { orderBy: { method: "asc" }, select: { id: true, method: true } },
          redemptions: { orderBy: { channel: "asc" }, select: { id: true, channel: true } },
        },
      },
    },
  });
  const variant = card?.variants[0];
  if (
    !card ||
    card.merchantId !== specification.merchantId ||
    card.merchant.name !== specification.merchantName ||
    card.merchant.slug !== specification.merchantSlug ||
    card.title !== specification.title ||
    card.slug !== specification.cardSlug ||
    card.officialUrl !== specification.officialUrlAfter ||
    card.status !== "ACTIVE" ||
    card.verificationStatus !== specification.expectedVerificationStatus ||
    card.variants.length !== 1 ||
    !variant ||
    variant.id !== specification.existingVariant.id ||
    JSON.stringify({
      name: variant.name,
      type: variant.type,
      currency: variant.currency,
      minValue: decimal(variant.minValue),
      maxValue: decimal(variant.maxValue),
      customValueAllowed: variant.customValueAllowed,
      purchaseUrl: variant.purchaseUrl,
      validityMonths: variant.validityMonths,
      validityText: variant.validityText,
      active: variant.active,
    }) !== JSON.stringify(variantFields(specification.finalVariant)) ||
    JSON.stringify(
      variant.values.map((item) => ({ id: item.id, value: decimal(item.value)! })),
    ) !== JSON.stringify(action.expectedExistingValues) ||
    JSON.stringify(variant.deliveries) !== JSON.stringify(specification.existingVariant.deliveries) ||
    JSON.stringify(variant.redemptions) !==
      JSON.stringify(specification.existingVariant.redemptions)
  ) {
    throw new Error("Value-addition precondition failed for " + action.cardId + ".");
  }
}

async function applyPlan(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
  assertSourceReport(source);
  assertV2Lineage();
  if (plan.actionCount === 0) throw new Error("The approved plan has no actions.");
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
  if (fingerprint(cards) !== plan.targetFingerprint) {
    throw new Error("Target state changed after preview; refusing to apply.");
  }
  if (stableHash(liveEvidence) !== plan.liveEvidenceFingerprint) {
    throw new Error("Live official-page evidence changed after preview; refusing to apply.");
  }
  const bySpecification = new Map(SPECIFICATIONS.map((item) => [item.cardId, item]));
  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      const transactionCards = await loadTargets(tx);
      if (fingerprint(transactionCards) !== plan.targetFingerprint) {
        throw new Error("Target state changed before the transaction; refusing to apply.");
      }
      for (const action of plan.actions) {
        const specification = bySpecification.get(action.cardId);
        if (!specification) throw new Error("Unknown plan target " + action.cardId + ".");
        if (action.type === "UPDATE_OFFICIAL_URL") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: specification.title,
              slug: specification.cardSlug,
              officialUrl: action.expected,
              status: "ACTIVE",
              verificationStatus: specification.expectedVerificationStatus,
              updatedAt: new Date(action.expectedUpdatedAt),
              variants: { some: { id: action.variantId } },
            },
            data: { officialUrl: action.value },
          });
          if (result.count !== 1) {
            throw new Error("URL precondition failed for " + action.cardId + ".");
          }
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
          continue;
        }
        if (action.type === "UPDATE_VARIANT_FIELDS") {
          const result = await tx.giftCardVariant.updateMany({
            where: {
              id: action.variantId,
              giftCardId: action.cardId,
              name: action.before.name,
              type: action.before.type,
              currency: action.before.currency,
              minValue: action.before.minValue,
              maxValue: action.before.maxValue,
              customValueAllowed: action.before.customValueAllowed,
              purchaseUrl: action.before.purchaseUrl,
              validityMonths: action.before.validityMonths,
              validityText: action.before.validityText,
              active: action.before.active,
              updatedAt: new Date(action.expectedUpdatedAt),
            },
            data: {
              minValue: action.after.minValue,
              maxValue: action.after.maxValue,
              purchaseUrl: action.after.purchaseUrl,
              validityMonths: action.after.validityMonths,
            },
          });
          if (result.count !== 1) {
            throw new Error("Variant-field precondition failed for " + action.cardId + ".");
          }
          applied.push({
            actionId: action.actionId,
            variantId: action.variantId,
            before: action.before,
            after: action.after,
          });
          continue;
        }
        await assertValuesReadyForAddition(tx, specification, action);
        const result = await tx.giftCardValue.createMany({
          data: action.valuesToAdd.map((value) => ({ variantId: action.variantId, value })),
        });
        if (result.count !== action.valuesToAdd.length) {
          throw new Error("Value creation count failed for " + action.cardId + ".");
        }
        applied.push({
          actionId: action.actionId,
          variantId: action.variantId,
          addedValues: action.valuesToAdd,
        });
      }
      const finalCards = await loadTargets(tx);
      const finalById = new Map(finalCards.map((card) => [card.id, card]));
      for (const specification of SPECIFICATIONS) {
        const finalCard = finalById.get(specification.cardId);
        if (!finalCard || !specificationComplete(finalCard, specification)) {
          throw new Error("Atomic postcondition failed for " + specification.cardId + ".");
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
    lineagePlanIds: plan.lineagePlanIds,
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeImmutableJson(
    path.join(
      REPORT_DIR,
      "existing-variant-enrichment-v7-apply-" + plan.planId.slice(0, 16) + ".json",
    ),
    report,
  );
  return report;
}

async function postAudit(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
  assertSourceReport(source);
  assertV2Lineage();
  const cards = await loadTargets();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const results = SPECIFICATIONS.map((specification) => {
    const card = byId.get(specification.cardId);
    const variant = card?.variants[0];
    return {
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      passed: Boolean(card && specificationComplete(card, specification)),
      preserved: card
        ? {
            merchantName: card.merchant.name,
            merchantSlug: card.merchant.slug,
            cardSlug: card.slug,
            title: card.title,
            status: card.status,
            verificationStatus: card.verificationStatus,
            variantId: variant?.id || null,
            preservedValueIds: specification.existingVariant.values.map((item) => item.id),
            preservedDeliveryIds: specification.existingVariant.deliveries.map((item) => item.id),
            preservedRedemptionIds: specification.existingVariant.redemptions.map((item) => item.id),
          }
        : null,
    };
  });
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    lineagePlanIds: plan.lineagePlanIds,
    checked: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    databaseWrites: 0,
    results,
  };
  fs.writeFileSync(POST_AUDIT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeImmutableJson(
    path.join(
      REPORT_DIR,
      "existing-variant-enrichment-v7-post-audit-" + plan.planId.slice(0, 16) + ".json",
    ),
    report,
  );
  if (report.failed) throw new Error("Post-audit failed for " + report.failed + " cards.");
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) {
    throw new Error("--apply and --post-audit cannot be combined.");
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<SourceReport>(SOURCE_REPORT);
  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await applyPlan(plan, source);
    console.log("Dorokartes Existing Variant Enrichment v7 — APPLY");
    console.log("Plan ID: " + plan.planId);
    console.log("Applied actions: " + report.appliedCount);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan, source);
    console.log("Dorokartes Existing Variant Enrichment v7 — POST-AUDIT");
    console.log("Checked cards: " + report.checked);
    console.log("Passed: " + report.passed);
    console.log("Failed: " + report.failed);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2) + "\n", "utf8");
  writeCsv(plan.actions);
  writeImmutableJson(
    path.join(
      REPORT_DIR,
      "existing-variant-enrichment-v7-plan-" + plan.planId.slice(0, 16) + ".json",
    ),
    plan,
  );
  console.log("Dorokartes Existing Variant Enrichment v7 — PREVIEW");
  console.log("Evidence report: " + plan.sourceReportId);
  console.log("Lineage plans: " + plan.lineagePlanIds.join(", "));
  console.log("Plan ID: " + plan.planId);
  console.log("Cards: " + plan.cardCount);
  console.log("Actions: " + plan.actionCount);
  for (const type of [
    "UPDATE_OFFICIAL_URL",
    "UPDATE_VARIANT_FIELDS",
    "ADD_VARIANT_VALUES",
  ] as const) {
    console.log("  " + type + ": " + plan.actions.filter((action) => action.type === type).length);
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
