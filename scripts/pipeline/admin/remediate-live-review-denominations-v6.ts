import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { prisma } from "../../../lib/prisma";

const VERSION = 6 as const;
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
const PLAN_JSON = path.join(REPORT_DIR, "live-review-denominations-v6-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "live-review-denominations-v6-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "live-review-denominations-v6-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "live-review-denominations-v6-post-audit.json");

type DeliveryMethod = "EMAIL" | "PHYSICAL_DELIVERY";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE";
type AssertionScope = "BODY" | "CONTROLS";
type Interaction = "EXPAND_DESCRIPTION";

type SourceSpecification = {
  url: string;
  expectedFinalUrl?: string;
  titlePattern: RegExp;
  interaction?: Interaction;
  assertions: Array<{ label: string; scope?: AssertionScope; pattern: RegExp }>;
};

type VariantSpecification = {
  name: "Digital" | "Physical";
  type: "DIGITAL" | "PHYSICAL";
  minValue: string;
  maxValue: string;
  customValueAllowed: false;
  values: string[];
  deliveryMethods: DeliveryMethod[];
  redemptionChannels: RedemptionChannel[];
  validityMonths: number | null;
};

type FindingExpectation = {
  finalUrl: string;
  status: "REVIEW";
  reasons: string[];
  existingVariantCount: 0;
};

type Specification = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  expectedTitle: string;
  titleAfter: string;
  cardSlug: string;
  expectedVerificationStatus: "NEEDS_REVIEW";
  officialUrlBefore: string;
  officialUrlAfter: string;
  sourceFinding: FindingExpectation;
  variant: VariantSpecification;
  sources: SourceSpecification[];
  evidence: string[];
};

function vinylProductSource(value: string): SourceSpecification {
  return {
    url: "https://vinylartclothing.gr/products/gift-card-" + value,
    titlePattern: new RegExp("^Vinyl gift card " + value + "€$", "iu"),
    interaction: "EXPAND_DESCRIPTION",
    assertions: [
      {
        label: "€" + value + " product identity",
        pattern: new RegExp("Δωροκάρτα\\s+αξίας\\s+" + value + "\\s*€", "iu"),
      },
      {
        label: "physical gift packaging",
        pattern:
          /Την\s+δωροκάρτα\s+θα\s+την\s+παραλάβετε\s+σε\s+φυσική\s+μορφή\s+και\s+σε\s+συσκευασία\s+δώρου/iu,
      },
      {
        label: "e-shop-only redemption and physical delivery",
        pattern:
          /Η\s+Δωροκάρτα\s+Vinyl\s+εξαργυρώνεται\s+ΑΠΟΚΛΕΙΣΤΙΚΑ\s+μέσω\s+του\s+e-shop\s+μας\s+και\s+σας\s+αποστέλλεται\s+σε\s+φυσική\s+μορφή/iu,
      },
      {
        label: "online checkout coupon redemption",
        pattern:
          /Η\s+εξαργύρωση\s+γίνεται\s+χρησιμοποιώντας\s+τον\s+κωδικό[\s\S]{0,180}στο\s+πεδίο\s+"κουπόνι\s+έκπτωσης"[\s\S]{0,100}ηλεκτρονικό\s+μας\s+κατάστημα/iu,
      },
    ],
  };
}

const SPECIFICATIONS: Specification[] = [
  {
    cardId: "cmta1itdc00e8q8iy8qkpk1e1",
    merchantId: "cmta1it7x00e7q8iyoinm2cbt",
    merchantName: "Materiaprima",
    merchantSlug: "materiaprima",
    expectedTitle: "Δωροκάρτα 70 - materiaprima",
    titleAfter: "Materiaprima Gift Card",
    cardSlug: "materiaprima-δωροκαρτα-70-materiaprima",
    expectedVerificationStatus: "NEEDS_REVIEW",
    officialUrlBefore: "https://materiaprima.gr/product/gift-card-40e/",
    officialUrlAfter: "https://materiaprima.gr/specials/dorokartes/",
    sourceFinding: {
      finalUrl: "https://materiaprima.gr/product/gift-card-40e/",
      status: "REVIEW",
      reasons: [
        "TITLE_URL_AMOUNT_CONFLICT",
        "TITLE_AMOUNT_NOT_CONFIRMED_ON_PAGE",
        "CURRENCY_UNRESOLVED",
      ],
      existingVariantCount: 0,
    },
    variant: {
      name: "Digital",
      type: "DIGITAL",
      minValue: "20",
      maxValue: "120",
      customValueAllowed: false,
      values: ["20", "40", "70", "120"],
      deliveryMethods: ["EMAIL"],
      redemptionChannels: ["ONLINE", "PHYSICAL_STORE"],
      validityMonths: 3,
    },
    sources: [
      {
        url: "https://materiaprima.gr/product/gift-card-40e/",
        titlePattern: /^Δωροκάρτα\s+40\s+-\s+materiaprima$/iu,
        assertions: [
          { label: "€40 product identity", pattern: /Δωροκάρτα\s+40\b/iu },
          {
            label: "recipient digital-card email delivery",
            pattern:
              /Ο\s+παραλήπτης\s+θα\s+λάβει\s+την\s+ψηφιακή\s+κάρτα\s+δώρου\s+σας\s+μέσω\s+email\s+σύντομα/iu,
          },
          {
            label: "online and physical-store choice",
            pattern:
              /απευθείας\s+από\s+το\s+ηλεκτρονικό\s+ή\s+το\s+φυσικό\s+κατάστημά\s+μας/iu,
          },
          {
            label: "three-month expiry",
            pattern: /Η\s+ημερομηνία\s+λήξης\s+είναι\s+μετά\s+από\s+3\s+μήνες/iu,
          },
        ],
      },
      {
        url: "https://materiaprima.gr/specials/dorokartes/",
        titlePattern: /^Δωροκάρτες\s+-\s+materiaprima$/iu,
        assertions: [
          { label: "exact four-item category", pattern: /Showing\s+1-4\s+of\s+4\s+items/iu },
          {
            label: "€20 denomination",
            pattern: /Δωροκάρτα\s+20\s+20,00\s*€/iu,
          },
          {
            label: "€40 denomination",
            pattern: /Δωροκάρτα\s+40\s+40,00\s*€/iu,
          },
          {
            label: "€70 denomination",
            pattern: /Δωροκάρτα\s+70\s+70,00\s*€/iu,
          },
          {
            label: "€120 denomination",
            pattern: /Δωροκάρτα\s+120\s+120,00\s*€/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official product copy explicitly states digital gift-card delivery to the recipient by email.",
      "Official product copy explicitly supports the online shop and physical stores and states three-month expiry.",
      "The official gift-card category lists exactly four products: €20, €40, €70 and €120.",
      "The verified same-domain gift-card category replaces the conflicting €40 product URL.",
    ],
  },
  {
    cardId: "cmta1l69r00o2q8iysx3o77ki",
    merchantId: "cmta1l63n00o1q8iyl0i4a7xt",
    merchantName: "Tacticalstore",
    merchantSlug: "tacticalstore",
    expectedTitle: "Δωροκάρτα 50€ Tactical Store – Digital Gift Card - Tacticalstore ...",
    titleAfter: "Tacticalstore Gift Card",
    cardSlug: "tacticalstore-δωροκαρτα-50-tactical-digital-gift-card-tacticalstore",
    expectedVerificationStatus: "NEEDS_REVIEW",
    officialUrlBefore:
      "https://www.tacticalstore.gr/product/dorokarta-tactical-store-100e-pro-gift-card/",
    officialUrlAfter: "https://www.tacticalstore.gr/cat/dorokartes/",
    sourceFinding: {
      finalUrl:
        "https://www.tacticalstore.gr/product/dorokarta-tactical-store-100e-pro-gift-card/",
      status: "REVIEW",
      reasons: ["TITLE_URL_AMOUNT_CONFLICT", "TITLE_AMOUNT_NOT_CONFIRMED_ON_PAGE"],
      existingVariantCount: 0,
    },
    variant: {
      name: "Digital",
      type: "DIGITAL",
      minValue: "25",
      maxValue: "100",
      customValueAllowed: false,
      values: ["25", "50", "100"],
      deliveryMethods: ["EMAIL"],
      redemptionChannels: [],
      validityMonths: 12,
    },
    sources: [
      {
        url: "https://www.tacticalstore.gr/product/dorokarta-tactical-store-100e-pro-gift-card/",
        titlePattern: /Δωροκάρτα\s+100€\s+Tactical\s+Store[\s\S]*Digital\s+Gift\s+Card/iu,
        assertions: [
          {
            label: "€100 product identity",
            pattern:
              /ΔΩΡΟΚΑΡΤΑ\s+TACTICAL\s+STORE\s+100€\s+[–-]\s+PRO\s+GIFT\s+CARD/iu,
          },
          {
            label: "digital email delivery",
            pattern:
              /η\s+δωροκάρτα\s+αποστέλλεται\s+σε\s+ψηφιακή\s+μορφή\s+μέσω\s+email/iu,
          },
          {
            label: "twelve-month validity",
            pattern: /Διάρκεια\s+ισχύος:\s*12\s+μήνες/iu,
          },
          {
            label: "digital email format",
            pattern: /Μορφή:\s*Ψηφιακή\s*\(email\)/iu,
          },
        ],
      },
      {
        url: "https://www.tacticalstore.gr/cat/dorokartes/",
        titlePattern: /^ΔΩΡΟΚΑΡΤΕΣ\s+-\s+Tacticalstore/iu,
        assertions: [
          {
            label: "exact three-item category",
            pattern: /ΠΡΟΒΟΛΗ\s+ΟΛΩΝ\s+ΤΩΝ\s+3\s+ΑΠΟΤΕΛΕΣΜΑΤΩΝ/iu,
          },
          {
            label: "€25 denomination",
            pattern:
              /Δωροκάρτα\s+Tactical\s+Store\s+25€\s+[–-]\s+Starter\s+Gift\s+Card\s+25\.00\s*€/iu,
          },
          {
            label: "€50 denomination",
            pattern:
              /Δωροκάρτα\s+Tactical\s+Store\s+50€\s+[–-]\s+Advanced\s+Gift\s+Card\s+50\.00\s*€/iu,
          },
          {
            label: "€100 denomination",
            pattern:
              /Δωροκάρτα\s+Tactical\s+Store\s+100€\s+[–-]\s+Pro\s+Gift\s+Card\s+100\.00\s*€/iu,
          },
        ],
      },
    ],
    evidence: [
      "Official product copy explicitly states digital delivery by email.",
      "Official product copy explicitly states twelve-month validity.",
      "The official category contains exactly €25, €50 and €100 gift cards.",
      "No redemption channel is inferred because the official copy does not explicitly state one.",
      "The verified same-domain gift-card category replaces the conflicting €100 product URL.",
    ],
  },
  {
    cardId: "cmta1nyzl00yyq8iy0qetgjxm",
    merchantId: "cmta1nys900yxq8iye6g35elk",
    merchantName: "Vinylartclothing",
    merchantSlug: "vinylartclothing",
    expectedTitle: "Vinyl gift card 40€",
    titleAfter: "Vinylartclothing Gift Card",
    cardSlug: "vinylartclothing-vinyl-gift-card-40",
    expectedVerificationStatus: "NEEDS_REVIEW",
    officialUrlBefore: "https://vinylartclothing.gr/products/gift-card-40",
    officialUrlAfter: "https://vinylartclothing.gr/search?q=gift%20card",
    sourceFinding: {
      finalUrl: "https://vinylartclothing.gr/products/gift-card-40",
      status: "REVIEW",
      reasons: [
        "OPERATOR_EXCLUDED_AFTER_RENDERED_PAGE_REVIEW",
        "Rendered Vinyl product page does not establish electronic delivery; hidden electronic-card text is insufficient.",
      ],
      existingVariantCount: 0,
    },
    variant: {
      name: "Physical",
      type: "PHYSICAL",
      minValue: "40",
      maxValue: "130",
      customValueAllowed: false,
      values: ["40", "60", "80", "100", "130"],
      deliveryMethods: ["PHYSICAL_DELIVERY"],
      redemptionChannels: ["ONLINE"],
      validityMonths: null,
    },
    sources: [
      vinylProductSource("40"),
      vinylProductSource("60"),
      vinylProductSource("80"),
      vinylProductSource("100"),
      vinylProductSource("130"),
      {
        url: "https://vinylartclothing.gr/search?q=gift%20card",
        titlePattern: /Αναζήτηση:\s*Βρέθηκαν\s+7\s+αποτελέσματα\s+για\s+"gift card"/iu,
        assertions: [
          {
            label: "five gift-card product results",
            pattern:
              /VINYL\s+GIFT\s+CARD\s+100€[\s\S]{0,120}VINYL\s+GIFT\s+CARD\s+60€[\s\S]{0,120}VINYL\s+GIFT\s+CARD\s+130€[\s\S]{0,120}VINYL\s+GIFT\s+CARD\s+40€[\s\S]{0,120}VINYL\s+GIFT\s+CARD\s+80€/iu,
          },
          {
            label: "€40 denomination",
            pattern: /VINYL\s+GIFT\s+CARD\s+40€\s+ΤΙΜΗ\s+ΠΩΛΗΣΗΣ\s+€40,00\s+EUR/iu,
          },
          {
            label: "€60 denomination",
            pattern: /VINYL\s+GIFT\s+CARD\s+60€\s+ΤΙΜΗ\s+ΠΩΛΗΣΗΣ\s+€60,00\s+EUR/iu,
          },
          {
            label: "€80 denomination",
            pattern: /VINYL\s+GIFT\s+CARD\s+80€\s+ΤΙΜΗ\s+ΠΩΛΗΣΗΣ\s+€80,00\s+EUR/iu,
          },
          {
            label: "€100 denomination",
            pattern: /VINYL\s+GIFT\s+CARD\s+100€\s+ΤΙΜΗ\s+ΠΩΛΗΣΗΣ\s+€100,00\s+EUR/iu,
          },
          {
            label: "€130 denomination",
            pattern: /VINYL\s+GIFT\s+CARD\s+130€\s+ΤΙΜΗ\s+ΠΩΛΗΣΗΣ\s+€130,00\s+EUR/iu,
          },
        ],
      },
    ],
    evidence: [
      "Each of the five official product pages is checked after opening its visible Description accordion.",
      "Each product description explicitly states physical delivery in gift packaging.",
      "Each product description explicitly states e-shop-only redemption with the checkout coupon code.",
      "The official same-domain search lists the five fixed values €40, €60, €80, €100 and €130.",
      "The general same-domain gift-card search replaces the denomination-specific €40 product URL.",
    ],
  },
];

type SourceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: Array<{
    cardId: string;
    merchantId: string;
    merchantName: string;
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
    interactions: Interaction[];
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
  return parsed.protocol + "//" + host + pathname + parsed.search;
}

async function applyInteraction(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  interaction: Interaction,
) {
  if (interaction !== "EXPAND_DESCRIPTION") {
    throw new Error("Unsupported evidence interaction: " + interaction);
  }
  const summary = page
    .locator("details.accordion__disclosure > summary")
    .filter({ hasText: "Περιγραφή" });
  if ((await summary.count()) !== 1) {
    throw new Error("Expected exactly one visible Description accordion on " + page.url());
  }
  if (!(await summary.isVisible())) {
    throw new Error("Description accordion is not visible on " + page.url());
  }
  await summary.click({ timeout: 10_000 });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("details")).some(
        (details) =>
          details.open && /Περιγραφή/iu.test(details.querySelector("summary")?.textContent || ""),
      ),
    null,
    { timeout: 10_000 },
  );
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
          await page.waitForFunction(() => (document.body?.innerText.length || 0) > 800, null, {
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
          if (canonicalPageKey(page.url()) !== canonicalPageKey(source.expectedFinalUrl || source.url)) {
            throw new Error("Official source redirected away from its approved page: " + source.url);
          }
          const interactions: Interaction[] = [];
          if (source.interaction) {
            await applyInteraction(page, source.interaction);
            interactions.push(source.interaction);
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
                      "name=" + (element.getAttribute("name") || ""),
                      "type=" + (element.getAttribute("type") || ""),
                      "value=" + (element.getAttribute("value") || ""),
                      "text=" + (element.textContent?.trim() || ""),
                      "placeholder=" + (input.placeholder || ""),
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
          const title = normalizeText(await page.title());
          if (!source.titlePattern.test(title)) {
            throw new Error("Official source title does not match its approved identity: " + source.url);
          }
          const checks = source.assertions.map((assertion) => {
            const scope = assertion.scope || "BODY";
            const matched = (scope === "BODY" ? body : controls).match(assertion.pattern)?.[0];
            if (!matched) {
              throw new Error("Missing live evidence " + assertion.label + ": " + source.url);
            }
            return { label: assertion.label, scope, matched: normalizeText(matched) };
          });
          pages.push({
            requestedUrl: source.url,
            finalUrl: canonicalPageKey(page.url()),
            title,
            transport: "playwright-chrome",
            interactions,
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
    verificationStatus: card.verificationStatus,
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
      validityText: variant.validityText,
      active: variant.active,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
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
    const matches = source.findings.filter((item) => item.cardId === specification.cardId);
    const finding = matches[0];
    if (
      matches.length !== 1 ||
      !finding ||
      finding.merchantId !== specification.merchantId ||
      finding.merchantName !== specification.merchantName ||
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

function sortedNumbers(values: Array<string | number>) {
  return values.map(Number).sort((left, right) => left - right);
}

function specificationComplete(card: TargetState, specification: Specification) {
  const variant = card.variants[0];
  const actualValues = variant?.values.map((item) => Number(String(item.value))) || [];
  return Boolean(
    card.merchantId === specification.merchantId &&
      card.merchant.name === specification.merchantName &&
      card.merchant.slug === specification.merchantSlug &&
      card.title === specification.titleAfter &&
      card.slug === specification.cardSlug &&
      card.officialUrl === specification.officialUrlAfter &&
      card.status === "ACTIVE" &&
      card.verificationStatus === specification.expectedVerificationStatus &&
      card.variants.length === 1 &&
      variant?.name === specification.variant.name &&
      variant.type === specification.variant.type &&
      variant.currency === "EUR" &&
      decimal(variant.minValue) === specification.variant.minValue &&
      decimal(variant.maxValue) === specification.variant.maxValue &&
      variant.customValueAllowed === specification.variant.customValueAllowed &&
      variant.purchaseUrl === specification.officialUrlAfter &&
      variant.validityMonths === specification.variant.validityMonths &&
      variant.validityText === null &&
      variant.active &&
      JSON.stringify(sortedNumbers(actualValues)) ===
        JSON.stringify(sortedNumbers(specification.variant.values)) &&
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
    card.verificationStatus !== specification.expectedVerificationStatus ||
    card.variants.length !== 0
  ) {
    throw new Error("Catalog precondition failed for " + specification.cardId + ".");
  }
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
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
  fs.writeFileSync(PLAN_CSV, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

async function buildPlan(source: SourceReport): Promise<Plan> {
  assertSourceReport(source);
  const [cards, liveEvidence] = await Promise.all([loadTargets(), collectLiveEvidence()]);
  if (cards.length !== SPECIFICATIONS.length) {
    throw new Error("A live-reviewed target is missing.");
  }
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
    actions.push({
      type: "UPDATE_CARD_TITLE",
      actionId: "update-title:" + specification.cardId,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expected: specification.expectedTitle,
      value: specification.titleAfter,
      expectedUpdatedAt: card.updatedAt.toISOString(),
      evidence: specification.evidence,
    });
    actions.push({
      type: "UPDATE_OFFICIAL_URL",
      actionId: "update-official-url:" + specification.cardId,
      cardId: specification.cardId,
      merchantId: specification.merchantId,
      expected: specification.officialUrlBefore,
      value: specification.officialUrlAfter,
      evidence: specification.evidence,
    });
    actions.push({
      type: "CREATE_VARIANT",
      actionId: "create-variant:" + specification.cardId,
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
    throw new Error("Stored live-evidence fingerprint does not match its payload.");
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
      throw new Error("Stored live evidence has incomplete pages for " + specification.cardId + ".");
    }
    for (const [index, source] of specification.sources.entries()) {
      const page = entry.pages[index];
      const expectedInteractions = source.interaction ? [source.interaction] : [];
      if (
        page.requestedUrl !== source.url ||
        page.finalUrl !== canonicalPageKey(source.expectedFinalUrl || source.url) ||
        page.transport !== "playwright-chrome" ||
        !page.title ||
        page.title !== normalizeText(page.title) ||
        !source.titlePattern.test(page.title) ||
        JSON.stringify(page.interactions) !== JSON.stringify(expectedInteractions) ||
        !Array.isArray(page.checks) ||
        page.checks.length !== source.assertions.length
      ) {
        throw new Error("Stored live page metadata is invalid for " + source.url + ".");
      }
      for (const [checkIndex, assertion] of source.assertions.entries()) {
        const check = page.checks[checkIndex];
        if (
          check.label !== assertion.label ||
          check.scope !== (assertion.scope || "BODY") ||
          !check.matched ||
          check.matched !== normalizeText(check.matched) ||
          !assertion.pattern.test(check.matched)
        ) {
          throw new Error("Stored live evidence check is invalid for " + source.url + ".");
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
  const expectedActionIds = SPECIFICATIONS.filter((item) => cardIds.includes(item.cardId)).flatMap(
    (item) => [
      "update-title:" + item.cardId,
      "update-official-url:" + item.cardId,
      "create-variant:" + item.cardId,
    ],
  );
  if (JSON.stringify(plan.actions.map((action) => action.actionId)) !== JSON.stringify(expectedActionIds)) {
    throw new Error("Stored action ordering does not match the approved specifications.");
  }
  for (const cardId of cardIds) {
    const specification = specificationsByCard.get(cardId);
    const actions = plan.actions.filter((action) => action.cardId === cardId);
    if (!specification || actions.length !== 3) {
      throw new Error("Unexpected action group for " + cardId + ".");
    }
    const title = actions.find((action) => action.type === "UPDATE_CARD_TITLE");
    const url = actions.find((action) => action.type === "UPDATE_OFFICIAL_URL");
    const variant = actions.find((action) => action.type === "CREATE_VARIANT");
    if (
      !title ||
      title.actionId !== "update-title:" + cardId ||
      title.merchantId !== specification.merchantId ||
      title.expected !== specification.expectedTitle ||
      title.value !== specification.titleAfter ||
      !Number.isFinite(new Date(title.expectedUpdatedAt).getTime()) ||
      JSON.stringify(title.evidence) !== JSON.stringify(specification.evidence) ||
      !url ||
      url.actionId !== "update-official-url:" + cardId ||
      url.merchantId !== specification.merchantId ||
      url.expected !== specification.officialUrlBefore ||
      url.value !== specification.officialUrlAfter ||
      JSON.stringify(url.evidence) !== JSON.stringify(specification.evidence) ||
      !variant ||
      variant.actionId !== "create-variant:" + cardId ||
      variant.merchantId !== specification.merchantId ||
      variant.expectedTitleAfter !== specification.titleAfter ||
      variant.officialUrlAfter !== specification.officialUrlAfter ||
      JSON.stringify(variant.variant) !== JSON.stringify(specification.variant) ||
      JSON.stringify(variant.evidence) !== JSON.stringify(specification.evidence)
    ) {
      throw new Error("Stored actions do not match the approved specification for " + cardId + ".");
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
  if (!REQUESTED_PLAN_ID) {
    throw new Error("This operation requires --plan-id=<preview planId>.");
  }
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function applyPlan(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
  assertSourceReport(source);
  if (plan.actionCount === 0) throw new Error("The approved plan has no actions.");
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
        if (!specification) throw new Error("Unknown plan target " + action.cardId + ".");
        if (action.type === "UPDATE_CARD_TITLE") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: action.expected,
              slug: specification.cardSlug,
              officialUrl: specification.officialUrlBefore,
              status: "ACTIVE",
              verificationStatus: specification.expectedVerificationStatus,
              updatedAt: new Date(action.expectedUpdatedAt),
            },
            data: { title: action.value },
          });
          if (result.count !== 1) {
            throw new Error("Title precondition failed for " + action.cardId + ".");
          }
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
              verificationStatus: specification.expectedVerificationStatus,
            },
            data: { officialUrl: action.value },
          });
          if (result.count !== 1) {
            throw new Error("URL precondition failed for " + action.cardId + ".");
          }
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
            verificationStatus: true,
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
          current.verificationStatus !== specification.expectedVerificationStatus ||
          variantCount !== 0
        ) {
          throw new Error("Variant precondition failed for " + action.cardId + ".");
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
            deliveries: action.variant.deliveryMethods.length
              ? {
                  create: action.variant.deliveryMethods.map((method) => ({ method })),
                }
              : undefined,
            redemptions: action.variant.redemptionChannels.length
              ? {
                  create: action.variant.redemptionChannels.map((channel) => ({ channel })),
                }
              : undefined,
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
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeImmutableJson(
    path.join(REPORT_DIR, "live-review-denominations-v6-apply-" + plan.planId.slice(0, 16) + ".json"),
    report,
  );
  return report;
}

async function postAudit(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan, source);
  assertSourceReport(source);
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
            verificationStatus: card.verificationStatus,
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
  fs.writeFileSync(POST_AUDIT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeImmutableJson(
    path.join(
      REPORT_DIR,
      "live-review-denominations-v6-post-audit-" + plan.planId.slice(0, 16) + ".json",
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
    console.log("Dorokartes Live Review Denominations v6 — APPLY");
    console.log("Plan ID: " + plan.planId);
    console.log("Applied actions: " + report.appliedCount);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan, source);
    console.log("Dorokartes Live Review Denominations v6 — POST-AUDIT");
    console.log("Checked cards: " + report.checked);
    console.log("Passed: " + report.passed);
    console.log("Failed: " + report.failed);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2) + "\n", "utf8");
  writeCsv(plan.actions);
  writeImmutableJson(
    path.join(REPORT_DIR, "live-review-denominations-v6-plan-" + plan.planId.slice(0, 16) + ".json"),
    plan,
  );
  console.log("Dorokartes Live Review Denominations v6 — PREVIEW");
  console.log("Evidence report: " + plan.sourceReportId);
  console.log("Plan ID: " + plan.planId);
  console.log("Cards: " + plan.cardCount);
  console.log("Actions: " + plan.actionCount);
  for (const type of ["UPDATE_CARD_TITLE", "UPDATE_OFFICIAL_URL", "CREATE_VARIANT"] as const) {
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
