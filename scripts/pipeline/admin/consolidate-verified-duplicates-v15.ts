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
const SOURCE_AUDIT = path.join(REPORT_DIR, "full-catalog-cleanup-v11-post-audit.json");
const PLAN_JSON = path.join(REPORT_DIR, "verified-duplicate-consolidation-v15-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "verified-duplicate-consolidation-v15-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "verified-duplicate-consolidation-v15-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "verified-duplicate-consolidation-v15-post-audit.json");

type GiftCardStatus = "ACTIVE" | "ARCHIVED";
type VerificationStatus = "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
type VariantType = "DIGITAL" | "DIGITAL_AND_PHYSICAL" | "CORPORATE";
type RedemptionChannel = "ONLINE" | "PHYSICAL_STORE" | "PHONE";
type DeliveryMethod = "EMAIL" | "SMS" | "PHYSICAL_DELIVERY" | "PRINTABLE";

type ArchiveSpec = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  expectedStatus: GiftCardStatus;
  expectedVerificationStatus: VerificationStatus;
  keeperCardId: string;
  keeperExpectedTitle: string;
  keeperExpectedOfficialUrl: string;
  keeperFinalTitle: string;
  keeperFinalOfficialUrl: string;
  reason: string;
  evidence: string[];
};

type CardFields = {
  title: string;
  officialUrl: string;
  corporateAvailable: boolean;
  personalizationAvailable: boolean;
  verificationStatus: VerificationStatus;
};

type CardUpdateSpec = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  expected: CardFields;
  value: CardFields;
  reason: string;
  evidence: string[];
};

type MerchantUpdateSpec = {
  merchantId: string;
  expectedName: string;
  expectedWebsiteUrl: string;
  valueName: string;
  valueWebsiteUrl: string;
  reason: string;
  evidence: string[];
};

type VariantSpec = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedCardTitleBefore: string;
  expectedCardTitleAfter: string;
  name: string;
  variantType: VariantType;
  currency: "EUR";
  minValue: string | null;
  maxValue: string | null;
  customValueAllowed: boolean;
  purchaseUrl: string;
  validityMonths: number | null;
  values: string[];
  deliveries: DeliveryMethod[];
  redemptions: RedemptionChannel[];
  reason: string;
  evidence: string[];
};

type Action =
  | ({ type: "ARCHIVE_CARD"; actionId: string } & ArchiveSpec)
  | ({ type: "UPDATE_CARD"; actionId: string } & CardUpdateSpec)
  | ({ type: "UPDATE_MERCHANT"; actionId: string } & MerchantUpdateSpec)
  | ({ type: "CREATE_VARIANT"; actionId: string } & VariantSpec);

type Plan = {
  version: 15;
  mode: "PREVIEW";
  generatedAt: string;
  sourceAuditPlanId: string;
  targetFingerprint: string;
  planId: string;
  cardCount: number;
  merchantCount: number;
  actionCount: number;
  actions: Action[];
};

type SourceAudit = {
  planId: string;
  totalCards: number;
  reviews: Array<{ cardId: string; issues: string[] }>;
};

const ARCHIVES: ArchiveSpec[] = [
  {
    cardId: "cmtb7r23t0004u8iyh8gmkixy",
    merchantId: "cmtb77ti7004mdkiyn5wn9fgi",
    merchantName: "Chania Culture",
    expectedTitle: "Chania Culture Gift Card",
    expectedOfficialUrl: "https://shop.chania-culture.gr/product-category/psifiaka/dorokarta/",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "NEEDS_REVIEW",
    keeperCardId: "cmtb77tnt004ndkiyw1tey12d",
    keeperExpectedTitle: "Δωροκάρτα",
    keeperExpectedOfficialUrl: "https://shop.chania-culture.gr/product/gift-card/",
    keeperFinalTitle: "Chania Culture Gift Card",
    keeperFinalOfficialUrl: "https://shop.chania-culture.gr/product/gift-card/",
    reason: "The category URL contains one result and links to the keeper's exact product; both rows represent one program.",
    evidence: [
      "https://shop.chania-culture.gr/product-category/psifiaka/dorokarta/",
      "https://shop.chania-culture.gr/product/gift-card/",
      "Official category shows exactly one gift-card product.",
    ],
  },
  {
    cardId: "cmtb7r3ne000bu8iyhr8e822r",
    merchantId: "cmta1in0q00ddq8iy9ou6k8vv",
    merchantName: "Kois Optics",
    expectedTitle: "KOIS Optics Gift Card",
    expectedOfficialUrl: "https://www.kois-optics.gr/el/products/giftcard",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "NEEDS_REVIEW",
    keeperCardId: "cmta1in6000deq8iyzrf26jcw",
    keeperExpectedTitle: "Kois Optics Gift Card",
    keeperExpectedOfficialUrl: "https://kois-optics.gr/",
    keeperFinalTitle: "Kois Optics Gift Card",
    keeperFinalOfficialUrl: "https://www.kois-optics.gr/el/products/giftcard",
    reason: "Same merchant and single e-Gift Card program; retain the earlier verified card and move it to the exact product URL.",
    evidence: [
      "https://www.kois-optics.gr/el/products/giftcard",
      "Official product identifies one €100 Kois Optics e-Gift Card.",
    ],
  },
  {
    cardId: "cmta1ldih00owq8iybi4h3dxo",
    merchantId: "cmta1ldb100ovq8iysbonr92k",
    merchantName: "Lauraashleyshop",
    expectedTitle: "Gift Card Laura Ashley",
    expectedOfficialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "NEEDS_REVIEW",
    keeperCardId: "cmta421t70002t8iywrh9oyoy",
    keeperExpectedTitle: "Laura Ashley Δωροκάρτα – Gift Card",
    keeperExpectedOfficialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
    keeperFinalTitle: "Laura Ashley Gift Card",
    keeperFinalOfficialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
    reason: "Exact same official URL and zero dependent relations; retain the verified row as the canonical program.",
    evidence: [
      "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
      "Both records point to the identical official product.",
    ],
  },
  {
    cardId: "cmtb6uo3d001i3giyiq64l7pb",
    merchantId: "cmta5nnll000i54iywoggd8zt",
    merchantName: "Floraplant",
    expectedTitle: "GIFT CARD - Δωροκάρτα - Floraplant & Garden Center",
    expectedOfficialUrl: "https://floraplant.gr/gift-card/",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "VERIFIED",
    keeperCardId: "cmta5nnqb000j54iy5h71qhyd",
    keeperExpectedTitle: "Δωροκάρτες - Floraplant",
    keeperExpectedOfficialUrl: "https://eshop.floraplant.gr/en/giftcards/",
    keeperFinalTitle: "Floraplant Gift Card",
    keeperFinalOfficialUrl: "https://eshop.floraplant.gr/en/giftcard/",
    reason: "The corporate-site article links to the same single e-shop gift-card product; retain the purchase record.",
    evidence: [
      "https://floraplant.gr/gift-card/",
      "https://eshop.floraplant.gr/en/giftcard/",
      "The corporate page links to the e-shop and the e-shop category contains one product.",
    ],
  },
  {
    cardId: "cmta1g5lj004tq8iy2gi1o7hn",
    merchantId: "cmta1g5ei004sq8iyj1nwtg24",
    merchantName: "Kotsovolos",
    expectedTitle: "Kotsovolos Δωροκάρτα – Gift Card!",
    expectedOfficialUrl: "https://kotsovolos-b2b.giftcards-store.com/el",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "VERIFIED",
    keeperCardId: "cmtb785to006cdkiy9ubl9s4x",
    keeperExpectedTitle: "Gift Card - Δωροκάρτα | ΚΩΤΣΟΒΟΛΟΣ",
    keeperExpectedOfficialUrl: "https://www.kotsovolos.gr/pages/e-giftcard",
    keeperFinalTitle: "Kotsovolos Gift Card",
    keeperFinalOfficialUrl: "https://www.kotsovolos.gr/pages/e-giftcard",
    reason: "B2B is a corporate purchase channel for the same Kotsovolos gift-card program, represented as a Corporate variant.",
    evidence: [
      "https://www.kotsovolos.gr/pages/e-giftcard",
      "https://kotsovolos-b2b.giftcards-store.com/el",
      "Official B2B page identifies digital Kotsovolos Gift Cards for corporate gifts.",
    ],
  },
  {
    cardId: "cmta1g612004uq8iy6ctyhbtp",
    merchantId: "cmt8hesrb000fa8iycuggb6wc",
    merchantName: "Puma Greece",
    expectedTitle: "Gift Card Terms & Conditions",
    expectedOfficialUrl: "https://giftcard.puma.com/de/en/TERMS_AND_CONDITIONS.html",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "VERIFIED",
    keeperCardId: "cmt8hesz5000ga8iykmbj9m8y",
    keeperExpectedTitle: "Puma Greece Gift Card",
    keeperExpectedOfficialUrl: "https://eu.puma.com/gr/en/pd/digital-gift-card",
    keeperFinalTitle: "Puma Greece Gift Card",
    keeperFinalOfficialUrl: "https://eu.puma.com/gr/en/pd/digital-gift-card",
    reason: "The archived row is a German terms page, not a separate Greek gift-card product.",
    evidence: [
      "https://giftcard.puma.com/de/en/TERMS_AND_CONDITIONS.html",
      "https://eu.puma.com/gr/en/pd/digital-gift-card",
      "Official Greek product page is already represented by the verified keeper.",
    ],
  },
  {
    cardId: "cmta1fp5c0037q8iy0bte1j9f",
    merchantId: "cmta1fozl0036q8iyfva5aozo",
    merchantName: "Thomann",
    expectedTitle: "Thomann Gift Certificate 50 EUR",
    expectedOfficialUrl: "https://www.thomann.de/gr/index.html",
    expectedStatus: "ACTIVE",
    expectedVerificationStatus: "VERIFIED",
    keeperCardId: "cmta5nyde002454iyc6vaizw0",
    keeperExpectedTitle: "Buy Gift voucher at Thomann",
    keeperExpectedOfficialUrl: "https://www.thomann.gr/gift_voucher.html",
    keeperFinalTitle: "Thomann Gift Card",
    keeperFinalOfficialUrl: "https://www.thomann.gr/gift_voucher.html",
    reason: "The amount-bearing homepage row is one denomination of the keeper's official multi-value voucher program.",
    evidence: [
      "https://www.thomann.gr/gift_voucher.html",
      "Official program page lists €10, €25 and €50 vouchers.",
    ],
  },
];

const CARD_UPDATES: CardUpdateSpec[] = [
  {
    cardId: "cmtb77tnt004ndkiyw1tey12d",
    merchantId: "cmtb77ti7004mdkiyn5wn9fgi",
    merchantName: "Chania Culture",
    expected: {
      title: "Δωροκάρτα",
      officialUrl: "https://shop.chania-culture.gr/product/gift-card/",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Chania Culture Gift Card",
      officialUrl: "https://shop.chania-culture.gr/product/gift-card/",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    reason: "Canonical title for the retained program.",
    evidence: ["https://shop.chania-culture.gr/product/gift-card/"],
  },
  {
    cardId: "cmta1in6000deq8iyzrf26jcw",
    merchantId: "cmta1in0q00ddq8iy9ou6k8vv",
    merchantName: "Kois Optics",
    expected: {
      title: "Kois Optics Gift Card",
      officialUrl: "https://kois-optics.gr/",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Kois Optics Gift Card",
      officialUrl: "https://www.kois-optics.gr/el/products/giftcard",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "NEEDS_REVIEW",
    },
    reason: "Replace the homepage with the independently validated exact official product URL.",
    evidence: ["https://www.kois-optics.gr/el/products/giftcard"],
  },
  {
    cardId: "cmta421t70002t8iywrh9oyoy",
    merchantId: "cmta1ldb100ovq8iysbonr92k",
    merchantName: "Lauraashleyshop",
    expected: {
      title: "Laura Ashley Δωροκάρτα – Gift Card",
      officialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Laura Ashley Gift Card",
      officialUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    reason: "Canonical program title after exact-URL duplicate consolidation.",
    evidence: ["https://www.lauraashleyshop.gr/products/gift-card-laura-ashley"],
  },
  {
    cardId: "cmta5nnqb000j54iy5h71qhyd",
    merchantId: "cmta5nnll000i54iywoggd8zt",
    merchantName: "Floraplant",
    expected: {
      title: "Δωροκάρτες - Floraplant",
      officialUrl: "https://eshop.floraplant.gr/en/giftcards/",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Floraplant Gift Card",
      officialUrl: "https://eshop.floraplant.gr/en/giftcard/",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "NEEDS_REVIEW",
    },
    reason: "Canonicalize the title and use the independently validated direct product page.",
    evidence: ["https://eshop.floraplant.gr/en/giftcard/"],
  },
  {
    cardId: "cmtb785to006cdkiy9ubl9s4x",
    merchantId: "cmta1g5ei004sq8iyj1nwtg24",
    merchantName: "Kotsovolos",
    expected: {
      title: "Gift Card - Δωροκάρτα | ΚΩΤΣΟΒΟΛΟΣ",
      officialUrl: "https://www.kotsovolos.gr/pages/e-giftcard",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Kotsovolos Gift Card",
      officialUrl: "https://www.kotsovolos.gr/pages/e-giftcard",
      corporateAvailable: true,
      personalizationAvailable: true,
      verificationStatus: "VERIFIED",
    },
    reason: "Canonical program title; verified B2B channel supports corporate ordering and personalization.",
    evidence: [
      "https://www.kotsovolos.gr/pages/e-giftcard",
      "https://kotsovolos-b2b.giftcards-store.com/el",
    ],
  },
  {
    cardId: "cmta5nyde002454iyc6vaizw0",
    merchantId: "cmta1fozl0036q8iyfva5aozo",
    merchantName: "Thomann",
    expected: {
      title: "Buy Gift voucher at Thomann",
      officialUrl: "https://www.thomann.gr/gift_voucher.html",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    value: {
      title: "Thomann Gift Card",
      officialUrl: "https://www.thomann.gr/gift_voucher.html",
      corporateAvailable: false,
      personalizationAvailable: false,
      verificationStatus: "VERIFIED",
    },
    reason: "Canonical program title after representing denominations structurally.",
    evidence: ["https://www.thomann.gr/gift_voucher.html"],
  },
];

const MERCHANT_UPDATES: MerchantUpdateSpec[] = [
  {
    merchantId: "cmta1ldb100ovq8iysbonr92k",
    expectedName: "Lauraashleyshop",
    expectedWebsiteUrl: "https://lauraashleyshop.gr",
    valueName: "Laura Ashley",
    valueWebsiteUrl: "https://lauraashleyshop.gr",
    reason: "Use the brand identity shown by the official store and product.",
    evidence: ["https://www.lauraashleyshop.gr/products/gift-card-laura-ashley"],
  },
  {
    merchantId: "cmta1g5ei004sq8iyj1nwtg24",
    expectedName: "Kotsovolos",
    expectedWebsiteUrl: "https://kotsovolos-b2b.giftcards-store.com",
    valueName: "Kotsovolos",
    valueWebsiteUrl: "https://www.kotsovolos.gr",
    reason: "Use the consumer official root for the canonical merchant; retain B2B only on the Corporate variant.",
    evidence: [
      "https://www.kotsovolos.gr/pages/e-giftcard",
      "https://kotsovolos-b2b.giftcards-store.com/el",
    ],
  },
];

const VARIANTS: VariantSpec[] = [
  {
    cardId: "cmtb77tnt004ndkiyw1tey12d",
    merchantId: "cmtb77ti7004mdkiyn5wn9fgi",
    merchantName: "Chania Culture",
    expectedCardTitleBefore: "Δωροκάρτα",
    expectedCardTitleAfter: "Chania Culture Gift Card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "10",
    maxValue: "100",
    customValueAllowed: false,
    purchaseUrl: "https://shop.chania-culture.gr/product/gift-card/",
    validityMonths: null,
    values: ["10", "20", "50", "100"],
    deliveries: ["EMAIL"],
    redemptions: [],
    reason: "Represent the official product's fixed values and electronic recipient flow structurally.",
    evidence: [
      "Official product is under the Digital category.",
      "Official product lists €10, €20, €50 and €100 and requires recipient email.",
    ],
  },
  {
    cardId: "cmta1in6000deq8iyzrf26jcw",
    merchantId: "cmta1in0q00ddq8iy9ou6k8vv",
    merchantName: "Kois Optics",
    expectedCardTitleBefore: "Kois Optics Gift Card",
    expectedCardTitleAfter: "Kois Optics Gift Card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "100",
    maxValue: "100",
    customValueAllowed: false,
    purchaseUrl: "https://www.kois-optics.gr/el/products/giftcard",
    validityMonths: null,
    values: ["100"],
    deliveries: [],
    redemptions: [],
    reason: "Official page explicitly identifies one €100 e-Gift Card; no delivery/redemption details were inferred.",
    evidence: ["https://www.kois-optics.gr/el/products/giftcard"],
  },
  {
    cardId: "cmta421t70002t8iywrh9oyoy",
    merchantId: "cmta1ldb100ovq8iysbonr92k",
    merchantName: "Laura Ashley",
    expectedCardTitleBefore: "Laura Ashley Δωροκάρτα – Gift Card",
    expectedCardTitleAfter: "Laura Ashley Gift Card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: "25",
    maxValue: "150",
    customValueAllowed: false,
    purchaseUrl: "https://www.lauraashleyshop.gr/products/gift-card-laura-ashley",
    validityMonths: 4,
    values: ["25", "50", "100", "150"],
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHYSICAL_STORE"],
    reason: "Represent all values, email delivery, redemption channels and four-month validity stated by the official product.",
    evidence: ["https://www.lauraashleyshop.gr/products/gift-card-laura-ashley"],
  },
  {
    cardId: "cmtb785to006cdkiy9ubl9s4x",
    merchantId: "cmta1g5ei004sq8iyj1nwtg24",
    merchantName: "Kotsovolos",
    expectedCardTitleBefore: "Gift Card - Δωροκάρτα | ΚΩΤΣΟΒΟΛΟΣ",
    expectedCardTitleAfter: "Kotsovolos Gift Card",
    name: "Digital",
    variantType: "DIGITAL",
    currency: "EUR",
    minValue: null,
    maxValue: null,
    customValueAllowed: false,
    purchaseUrl: "https://www.kotsovolos.gr/pages/e-giftcard",
    validityMonths: null,
    values: [],
    deliveries: [],
    redemptions: [],
    reason: "Represent the official consumer e-Gift Card without inventing hidden iframe values or channels.",
    evidence: ["https://www.kotsovolos.gr/pages/e-giftcard"],
  },
  {
    cardId: "cmtb785to006cdkiy9ubl9s4x",
    merchantId: "cmta1g5ei004sq8iyj1nwtg24",
    merchantName: "Kotsovolos",
    expectedCardTitleBefore: "Gift Card - Δωροκάρτα | ΚΩΤΣΟΒΟΛΟΣ",
    expectedCardTitleAfter: "Kotsovolos Gift Card",
    name: "Corporate",
    variantType: "CORPORATE",
    currency: "EUR",
    minValue: null,
    maxValue: null,
    customValueAllowed: true,
    purchaseUrl: "https://kotsovolos-b2b.giftcards-store.com/el",
    validityMonths: 12,
    values: [],
    deliveries: ["EMAIL"],
    redemptions: ["ONLINE", "PHYSICAL_STORE", "PHONE"],
    reason: "Represent the verified B2B purchase channel as a Corporate variant of the same program.",
    evidence: [
      "Official B2B page supports user-defined value and personalization.",
      "Official B2B page states inbox/direct delivery, online/phone/store redemption and one-year validity.",
    ],
  },
  {
    cardId: "cmta5nyde002454iyc6vaizw0",
    merchantId: "cmta1fozl0036q8iyfva5aozo",
    merchantName: "Thomann",
    expectedCardTitleBefore: "Buy Gift voucher at Thomann",
    expectedCardTitleAfter: "Thomann Gift Card",
    name: "Digital and Physical",
    variantType: "DIGITAL_AND_PHYSICAL",
    currency: "EUR",
    minValue: "10",
    maxValue: "50",
    customValueAllowed: false,
    purchaseUrl: "https://www.thomann.gr/gift_voucher.html",
    validityMonths: null,
    values: ["10", "25", "50"],
    deliveries: ["EMAIL", "SMS", "PHYSICAL_DELIVERY", "PRINTABLE"],
    redemptions: ["ONLINE"],
    reason: "Represent all official denominations and print/email/SMS/post delivery options structurally.",
    evidence: ["https://www.thomann.gr/gift_voucher.html"],
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

async function loadCards(cardIds: string[]) {
  return prisma.giftCard.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      corporateAvailable: true,
      personalizationAvailable: true,
      updatedAt: true,
      merchant: { select: { name: true, websiteUrl: true } },
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
          validityMonths: true,
          values: { select: { value: true }, orderBy: { value: "asc" } },
          deliveries: { select: { method: true }, orderBy: { method: "asc" } },
          redemptions: { select: { channel: true }, orderBy: { channel: "asc" } },
        },
        orderBy: { id: "asc" },
      },
      _count: {
        select: {
          variants: true,
          categories: true,
          occasions: true,
          sources: true,
          mediaAssets: true,
          clicks: true,
          verificationEvents: true,
          reviewFlags: true,
          productionVerificationSnapshots: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

async function loadMerchants(merchantIds: string[]) {
  return prisma.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, name: true, slug: true, websiteUrl: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
}

type LoadedCard = Awaited<ReturnType<typeof loadCards>>[number];

function relationTotal(card: LoadedCard) {
  return Object.values(card._count).reduce((sum, count) => sum + count, 0);
}

function targetFingerprint(
  cards: Awaited<ReturnType<typeof loadCards>>,
  merchants: Awaited<ReturnType<typeof loadMerchants>>,
) {
  return stableHash({
    cards: cards.map((card) => ({
      ...card,
      updatedAt: card.updatedAt.toISOString(),
      variants: card.variants.map((variant) => ({
        ...variant,
        minValue: decimal(variant.minValue),
        maxValue: decimal(variant.maxValue),
        values: variant.values.map((item) => decimal(item.value)),
      })),
    })),
    merchants: merchants.map((merchant) => ({ ...merchant, updatedAt: merchant.updatedAt.toISOString() })),
  });
}

function cardMatches(card: LoadedCard, expected: CardFields) {
  return (
    card.title === expected.title &&
    card.officialUrl === expected.officialUrl &&
    card.corporateAvailable === expected.corporateAvailable &&
    card.personalizationAvailable === expected.personalizationAvailable &&
    card.verificationStatus === expected.verificationStatus
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
  const headers = ["type", "actionId", "cardId", "merchantId", "merchantName", "reason", "before", "after", "evidence"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...actions.map((action) => {
      const row: Record<string, unknown> = {
        type: action.type,
        actionId: action.actionId,
        cardId: "cardId" in action ? action.cardId : "",
        merchantId: action.merchantId,
        merchantName: "merchantName" in action ? action.merchantName : action.expectedName,
        reason: action.reason,
        before:
          action.type === "UPDATE_CARD"
            ? action.expected
            : action.type === "UPDATE_MERCHANT"
              ? { name: action.expectedName, websiteUrl: action.expectedWebsiteUrl }
              : action.type === "ARCHIVE_CARD"
                ? { title: action.expectedTitle, officialUrl: action.expectedOfficialUrl }
                : { title: action.expectedCardTitleBefore, variants: 0 },
        after:
          action.type === "UPDATE_CARD"
            ? action.value
            : action.type === "UPDATE_MERCHANT"
              ? { name: action.valueName, websiteUrl: action.valueWebsiteUrl }
              : action.type === "ARCHIVE_CARD"
                ? { status: "ARCHIVED", verificationStatus: "REJECTED", keeperCardId: action.keeperCardId }
                : {
                    name: action.name,
                    variantType: action.variantType,
                    values: action.values,
                    purchaseUrl: action.purchaseUrl,
                  },
        evidence: action.evidence,
      };
      return headers.map((header) => csvEscape(row[header])).join(",");
    }),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourceAudit): Promise<Plan> {
  if (source.totalCards !== 1135) throw new Error(`Expected the 1,135-card source audit, found ${source.totalCards}.`);
  const reviewedIds = new Set(source.reviews.map((review) => review.cardId));
  const cardIds = [
    ...new Set([
      ...ARCHIVES.flatMap((item) => [item.cardId, item.keeperCardId]),
      ...CARD_UPDATES.map((item) => item.cardId),
      ...VARIANTS.map((item) => item.cardId),
    ]),
  ];
  const merchantIds = [...new Set(MERCHANT_UPDATES.map((item) => item.merchantId))];
  const cards = await loadCards(cardIds);
  const merchants = await loadMerchants(merchantIds);
  if (cards.length !== cardIds.length) throw new Error(`Expected ${cardIds.length} target cards, found ${cards.length}.`);
  if (merchants.length !== merchantIds.length) throw new Error(`Expected ${merchantIds.length} merchants, found ${merchants.length}.`);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));

  for (const spec of ARCHIVES) {
    const card = cardsById.get(spec.cardId);
    const keeper = cardsById.get(spec.keeperCardId);
    if (!reviewedIds.has(spec.cardId) || !reviewedIds.has(spec.keeperCardId)) {
      throw new Error(`Archive pair is not fully represented in the source review: ${spec.cardId}.`);
    }
    if (
      !card ||
      !keeper ||
      card.merchantId !== spec.merchantId ||
      keeper.merchantId !== spec.merchantId ||
      card.merchant.name !== spec.merchantName ||
      card.title !== spec.expectedTitle ||
      card.officialUrl !== spec.expectedOfficialUrl ||
      card.status !== spec.expectedStatus ||
      card.verificationStatus !== spec.expectedVerificationStatus ||
      keeper.title !== spec.keeperExpectedTitle ||
      keeper.officialUrl !== spec.keeperExpectedOfficialUrl ||
      keeper.status !== "ACTIVE" ||
      relationTotal(card) !== 0
    ) {
      throw new Error(`Archive precondition failed for ${spec.cardId}.`);
    }
  }

  for (const spec of CARD_UPDATES) {
    const card = cardsById.get(spec.cardId);
    if (
      !card ||
      card.merchantId !== spec.merchantId ||
      card.merchant.name !== spec.merchantName ||
      card.status !== "ACTIVE" ||
      !cardMatches(card, spec.expected)
    ) {
      throw new Error(`Card-update precondition failed for ${spec.cardId}.`);
    }
  }

  for (const spec of MERCHANT_UPDATES) {
    const merchant = merchantsById.get(spec.merchantId);
    if (!merchant || merchant.name !== spec.expectedName || merchant.websiteUrl !== spec.expectedWebsiteUrl) {
      throw new Error(`Merchant-update precondition failed for ${spec.merchantId}.`);
    }
  }

  for (const spec of VARIANTS) {
    const card = cardsById.get(spec.cardId);
    if (
      !card ||
      card.merchantId !== spec.merchantId ||
      card.title !== spec.expectedCardTitleBefore ||
      card.status !== "ACTIVE" ||
      card.variants.length !== 0
    ) {
      throw new Error(`Variant precondition failed for ${spec.cardId}.`);
    }
  }

  const actions: Action[] = [
    ...ARCHIVES.map((spec) => ({ ...spec, type: "ARCHIVE_CARD" as const, actionId: `archive-verified-duplicate:${spec.cardId}` })),
    ...MERCHANT_UPDATES.map((spec) => ({
      ...spec,
      type: "UPDATE_MERCHANT" as const,
      actionId: `update-verified-merchant:${spec.merchantId}`,
    })),
    ...CARD_UPDATES.map((spec) => ({ ...spec, type: "UPDATE_CARD" as const, actionId: `update-verified-card:${spec.cardId}` })),
    ...VARIANTS.map((spec, index) => ({
      ...spec,
      type: "CREATE_VARIANT" as const,
      actionId: `create-verified-variant:${spec.cardId}:${index}:${spec.variantType}`,
    })),
  ];
  const order: Record<Action["type"], number> = {
    ARCHIVE_CARD: 0,
    UPDATE_MERCHANT: 1,
    UPDATE_CARD: 2,
    CREATE_VARIANT: 3,
  };
  actions.sort((a, b) => order[a.type] - order[b.type] || a.actionId.localeCompare(b.actionId));
  const material = {
    version: 15 as const,
    mode: "PREVIEW" as const,
    sourceAuditPlanId: source.planId,
    targetFingerprint: targetFingerprint(cards, merchants),
    cardCount: cardIds.length,
    merchantCount: merchantIds.length,
    actionCount: actions.length,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(planMaterial(material)) };
}

async function applyPlan(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("Apply requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored plan.");
  verifyPlan(plan);
  const cardIds = [
    ...new Set(
      plan.actions.flatMap((action) =>
        action.type === "ARCHIVE_CARD" ? [action.cardId, action.keeperCardId] : "cardId" in action ? [action.cardId] : [],
      ),
    ),
  ];
  const merchantIds = [...new Set(plan.actions.map((action) => action.merchantId))];
  const cards = await loadCards(cardIds);
  const merchants = await loadMerchants(merchantIds.filter((id) => MERCHANT_UPDATES.some((item) => item.merchantId === id)));
  if (targetFingerprint(cards, merchants) !== plan.targetFingerprint) throw new Error("Target state changed after preview.");

  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      const variantsCreatedByCard = new Map<string, number>();
      for (const action of plan.actions) {
        if (action.type === "ARCHIVE_CARD") {
          const card = await tx.giftCard.findUnique({
            where: { id: action.cardId },
            select: {
              _count: {
                select: {
                  variants: true,
                  categories: true,
                  occasions: true,
                  sources: true,
                  mediaAssets: true,
                  clicks: true,
                  verificationEvents: true,
                  reviewFlags: true,
                  productionVerificationSnapshots: true,
                },
              },
            },
          });
          if (!card || Object.values(card._count).some((count) => count !== 0)) {
            throw new Error(`Archive target gained dependent relations: ${action.cardId}.`);
          }
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: action.expectedTitle,
              officialUrl: action.expectedOfficialUrl,
              status: action.expectedStatus,
              verificationStatus: action.expectedVerificationStatus,
            },
            data: { status: "ARCHIVED", verificationStatus: "REJECTED" },
          });
          if (result.count !== 1) throw new Error(`Archive update failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, cardId: action.cardId, keeperCardId: action.keeperCardId });
          continue;
        }
        if (action.type === "UPDATE_MERCHANT") {
          const result = await tx.merchant.updateMany({
            where: {
              id: action.merchantId,
              name: action.expectedName,
              websiteUrl: action.expectedWebsiteUrl,
            },
            data: { name: action.valueName, websiteUrl: action.valueWebsiteUrl },
          });
          if (result.count !== 1) throw new Error(`Merchant update failed for ${action.merchantId}.`);
          applied.push({ actionId: action.actionId, merchantId: action.merchantId });
          continue;
        }
        if (action.type === "UPDATE_CARD") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              status: "ACTIVE",
              ...action.expected,
            },
            data: action.value,
          });
          if (result.count !== 1) throw new Error(`Card update failed for ${action.cardId}.`);
          applied.push({ actionId: action.actionId, cardId: action.cardId, value: action.value });
          continue;
        }
        const card = await tx.giftCard.findUnique({
          where: { id: action.cardId },
          select: { title: true, status: true },
        });
        const variantCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
        const expectedVariantCount = variantsCreatedByCard.get(action.cardId) || 0;
        if (
          !card ||
          card.title !== action.expectedCardTitleAfter ||
          card.status !== "ACTIVE" ||
          variantCount !== expectedVariantCount
        ) {
          throw new Error(`Variant apply precondition failed for ${action.cardId}.`);
        }
        const created = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: action.name,
            type: action.variantType,
            currency: action.currency,
            minValue: action.minValue,
            maxValue: action.maxValue,
            customValueAllowed: action.customValueAllowed,
            purchaseUrl: action.purchaseUrl,
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
        variantsCreatedByCard.set(action.cardId, expectedVariantCount + 1);
        applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: created.id });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  const report = {
    version: 15,
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    sourceAuditPlanId: plan.sourceAuditPlanId,
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function variantMatches(card: LoadedCard, action: Extract<Action, { type: "CREATE_VARIANT" }>) {
  return card.variants.some(
    (variant) =>
      variant.name === action.name &&
      variant.type === action.variantType &&
      variant.currency === action.currency &&
      decimal(variant.minValue) === action.minValue &&
      decimal(variant.maxValue) === action.maxValue &&
      variant.customValueAllowed === action.customValueAllowed &&
      variant.purchaseUrl === action.purchaseUrl &&
      variant.validityMonths === action.validityMonths &&
      JSON.stringify(variant.values.map((item) => decimal(item.value)).sort()) === JSON.stringify([...action.values].sort()) &&
      JSON.stringify(variant.deliveries.map((item) => item.method).sort()) === JSON.stringify([...action.deliveries].sort()) &&
      JSON.stringify(variant.redemptions.map((item) => item.channel).sort()) === JSON.stringify([...action.redemptions].sort()),
  );
}

async function postAudit(plan: Plan) {
  verifyPlan(plan);
  const cardIds = [
    ...new Set(
      plan.actions.flatMap((action) =>
        action.type === "ARCHIVE_CARD" ? [action.cardId, action.keeperCardId] : "cardId" in action ? [action.cardId] : [],
      ),
    ),
  ];
  const merchantIds = [
    ...new Set(plan.actions.filter((action) => action.type === "UPDATE_MERCHANT").map((action) => action.merchantId)),
  ];
  const cards = await loadCards(cardIds);
  const merchants = await loadMerchants(merchantIds);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const results = plan.actions.map((action) => {
    let passed = false;
    if (action.type === "ARCHIVE_CARD") {
      const card = cardsById.get(action.cardId);
      const keeper = cardsById.get(action.keeperCardId);
      passed = card && keeper
        ? card.status === "ARCHIVED" &&
          card.verificationStatus === "REJECTED" &&
          keeper.status === "ACTIVE" &&
          keeper.title === action.keeperFinalTitle &&
          keeper.officialUrl === action.keeperFinalOfficialUrl
        : false;
    } else if (action.type === "UPDATE_MERCHANT") {
      const merchant = merchantsById.get(action.merchantId);
      passed = merchant?.name === action.valueName && merchant.websiteUrl === action.valueWebsiteUrl;
    } else if (action.type === "UPDATE_CARD") {
      const card = cardsById.get(action.cardId);
      passed = card ? card.status === "ACTIVE" && cardMatches(card, action.value) : false;
    } else {
      const card = cardsById.get(action.cardId);
      passed = card ? card.title === action.expectedCardTitleAfter && variantMatches(card, action) : false;
    }
    return { actionId: action.actionId, type: action.type, passed };
  });
  const report = {
    version: 15,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    archivedCards: ARCHIVES.length,
    activeKeepers: new Set(ARCHIVES.map((item) => item.keeperCardId)).size,
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
    if (plan.sourceAuditPlanId !== source.planId) throw new Error("The source audit changed after preview.");
    const report = await applyPlan(plan);
    console.log("Dorokartes Verified Duplicate Consolidation v15 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    console.log(`Log: ${APPLY_LOG}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Verified Duplicate Consolidation v15 — POST-AUDIT");
    console.log(`Checked: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Archived cards: ${report.archivedCards}`);
    console.log(`Report: ${POST_AUDIT_JSON}`);
    console.log("Database writes: 0");
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  console.log("Dorokartes Verified Duplicate Consolidation v15 — PREVIEW");
  console.log(`Source audit plan: ${plan.sourceAuditPlanId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards checked: ${plan.cardCount}`);
  console.log(`Merchants checked: ${plan.merchantCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["ARCHIVE_CARD", "UPDATE_MERCHANT", "UPDATE_CARD", "CREATE_VARIANT"] as const) {
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
