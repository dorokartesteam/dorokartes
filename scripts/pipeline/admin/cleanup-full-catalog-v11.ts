import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const ACTIVE_ONLY = process.argv.includes("--active-only");
const PLAN_ID_ARG = process.argv.find((arg) => arg.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.csv");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-post-audit.json");
const POST_AUDIT_CSV = path.join(REPORT_DIR, "full-catalog-cleanup-v11-post-audit.csv");
const ACTIVE_POST_AUDIT_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-active-post-audit.json");
const ACTIVE_POST_AUDIT_CSV = path.join(REPORT_DIR, "full-catalog-cleanup-v11-active-post-audit.csv");
const APPLY_LOG = path.join(REPORT_DIR, "full-catalog-cleanup-v11-apply.json");

type Action =
  | {
      type: "ENSURE_MERCHANT";
      actionId: string;
      targetKey: string;
      targetName: string;
      targetSlug: string;
      targetWebsiteUrl: string;
      expectedExistingMerchantId: string | null;
      reason: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_MERCHANT_NAME";
      actionId: string;
      merchantId: string;
      cardId: string;
      expected: string;
      value: string;
      reason: string;
      evidence: string[];
    }
  | {
      type: "REASSIGN_CARD";
      actionId: string;
      cardId: string;
      expectedMerchantId: string;
      targetKey: string;
      targetExistingMerchantId: string | null;
      reason: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_CARD_TITLE";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      reason: string;
      evidence: string[];
    };

type Review = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  title: string;
  officialUrl: string | null;
  issues: string[];
  reason: string;
  proposedValue?: string | null;
  relationCounts: Record<string, number>;
  structuredAmounts: string[];
};

type Plan = {
  version: 11;
  generatedAt: string;
  mode: "PREVIEW";
  scope?: "ALL" | "NON_ARCHIVED";
  totalCards: number;
  catalogFingerprint: string;
  planId: string;
  summary: {
    actions: number;
    cardsWithActions: number;
    cardsWithReview: number;
    cleanUnaffected: number;
    byAction: Record<string, number>;
    byReviewIssue: Record<string, number>;
  };
  actions: Action[];
  reviews: Review[];
};

const RECOVERIES: Record<string, { expected: string[]; brand: string }> = {
  "parentingcourses.gr": { expected: ["2 - Parenting Courses"], brand: "Parenting Courses" },
  "godblesswomen.gr": { expected: ["25 CHF Gift card"], brand: "God Bless Women" },
  "bestwestern.gr": { expected: ["Best Western Gift Card"], brand: "Best Western" },
  "christakisathens.com": { expected: ["Christakis Gift Card"], brand: "Christakis" },
  "coffeelovers.gr": { expected: ["Coffeelovers Giftcard"], brand: "Coffee Lovers" },
  "createathens.gr": { expected: ["Create Gift Card"], brand: "Create Athens" },
  "fortyboutique.gr": {
    expected: ["F.O.R.T.Y. Boutique Gift Card - The Perfect Gift for Every Occasion"],
    brand: "F.O.R.T.Y. Boutique",
  },
  "angelopouloshair.gr": { expected: ["Gift Card"], brand: "Angelopoulos Hair" },
  "francesca.gr": { expected: ["Gift Card"], brand: "Francesca" },
  "katsudo.gr": { expected: ["Gift Voucher - Katsudo"], brand: "Katsudo" },
  "thelproject.gr": {
    expected: ["Gift Voucher - Theλamdaproject - Language School"],
    brand: "Theλamdaproject",
  },
  "zador.gr": { expected: ["Gift Voucher 100 EUR"], brand: "Zador" },
  "colordrop.gr": { expected: ["Giftcard - ColorDrop"], brand: "ColorDrop" },
  "globi.gr": { expected: ["Globi Digital Gift Card"], brand: "Globi" },
  "prepareforgreece.com": {
    expected: ["Greek Language Course Gift Card"],
    brand: "Prepare for Greece",
  },
  "konstantinidisdental.gr": {
    expected: ["KONSTANTINIDIS GIFT CARD - Νο1 Κέντρο Εμφυτευμάτων"],
    brand: "Konstantinidis Dental",
  },
  "oxygenplus.gr": { expected: ["Luxurious Day Spa Gift Card"], brand: "Oxygen Plus" },
  "stretchandrelax.gr": {
    expected: ["MASSAGE & PILATES GIFTCARD - Stretch & Relax"],
    brand: "Stretch & Relax",
  },
  "physismassage.gr": { expected: ["Massage Gift Card"], brand: "Physis Massage" },
  "massage-crete.com": {
    expected: ["Massage Gift Card by Mindful Touch in Chania Crete"],
    brand: "Mindful Touch",
  },
  "fourseasonsastirpalacehotelathens.giftpro.co.uk": {
    expected: ["Mercato Monetary Gift Card"],
    brand: "Mercato",
  },
  "hehe-messyplay.gr": { expected: ["Messy Play Gift Card"], brand: "HeHe Messy Play" },
  "valsamakis.gr": { expected: ["Name Day GIft Card - Καλαμάτα"], brand: "Valsamakis" },
  "northandsouthjewelry.gr": {
    expected: ["North & South jewelry gift card"],
    brand: "North & South Jewelry",
  },
  "omg.gr": { expected: ["OMG Gift Card"], brand: "OMG" },
  "timesstore.gr": {
    expected: ["Purchase a digital gift card - Ioannina"],
    brand: "Times Store",
  },
  "dermargylab.gr": { expected: ["S"], brand: "DerMARGY LAB" },
  "bioaromacrete.com": { expected: ["SPA Gift Card"], brand: "Bioaroma Crete" },
  "sandalista.gr": { expected: ["Sandalista Gift Card"], brand: "Sandalista" },
  "callistioia.com": {
    expected: ["Santorini Honeymoon Spa Gift Card"],
    brand: "Calisti Oia",
  },
  "vca.gr": {
    expected: ["Sick Gift Card - ViciousCyclesAthens"],
    brand: "Vicious Cycles Athens",
  },
  "santorinizenspa.com": {
    expected: ["Spa Gift Voucher in Santorini"],
    brand: "Santorini Zen Spa",
  },
  "latravel.gr": { expected: ["Travel Gift Voucher"], brand: "LA Travel" },
  "alexandrisstores.gr": {
    expected: ["Valentine's day Gift Card"],
    brand: "Alexandris Stores",
  },
  "cherrybox.gr": { expected: ["You are My Super Mom Gift Card"], brand: "Cherrybox" },
  "eurekathens.com": { expected: ["eureka athens gift card"], brand: "Eureka Athens" },
  "dimidistours.gr": { expected: ["my travel gift card"], brand: "Dimidis Tours" },
  "dronehouse.gr": { expected: ["s"], brand: "Drone House" },
  "blueblue.gr": { expected: ["s"], brand: "Blue Blue" },
  "pavoneshoes.gr": { expected: ["s"], brand: "Pavone Shoes" },
  "hobbywood.gr": { expected: ["ΔΩΡΟΚΑΡΤΑ 100€"], brand: "Hobbywood" },
  "cestino.gr": { expected: ["Δωροκάρτα"], brand: "Cestino" },
  "tailormadeknitwear.com.gr": {
    expected: ["Ηλεκτρονική Δωροκάρτα - Tailor Made knitwear GiftCard"],
    brand: "Tailor Made Knitwear",
  },
  "feedmepetshop.gr": { expected: ["- Feed Me"], brand: "Feed Me" },
  "naninails.gr": { expected: ["- NaniNails.gr"], brand: "NaniNails.gr" },
  "blacklotusmassage.gr": {
    expected: ["Black Lotus Massage Δωροκάρτα 30 Ευρώ"],
    brand: "Black Lotus Massage",
  },
  "msystems.gr": { expected: ["Msystems Δωροκάρτα 10e"], brand: "Msystems" },
  "outdoorway.gr": { expected: ["Outdoorway 10 Ευρώ"], brand: "Outdoorway" },
  "poem-luxury.gr": { expected: ["Poem-Luxury 100"], brand: "Poem Luxury" },
  "gatos-shoes.gr": { expected: ["d75"], brand: "Gatos Shoes" },
  "lookshop.gr": { expected: ["Super Dad"], brand: "Lookshop" },
  "fagottobooks.gr": { expected: ["αξίας 40 ευρώ"], brand: "Fagotto Books" },
  "linsonmoto.gr": { expected: ["ДРУГИ"], brand: "Linson Moto" },
  "cuka.gr": {
    expected: ["Δεν ξέρεις τι δώρο να κάνεις σε ένα αγαπημένο ..."],
    brand: "Cuka",
  },
  "caravin.gr": { expected: ["Κάρτα Δώρου"], brand: "Caravin" },
  "aleboutique.gr": { expected: ["- Aleboutique.gr"], brand: "Ale Boutique" },
  "blackswan-lbs.gr": { expected: ["- Blackswan-lbs.gr"], brand: "Black Swan LBS" },
  "bodywise.gr": {
    expected: ["- Bodywise Studio στη Θεσσαλονίκη"],
    brand: "Bodywise Studio",
  },
  "confetti-gifts.gr": { expected: ["- Confetti - Gifts"], brand: "Confetti Gifts" },
  "dmktools.gr": { expected: ["- Dmktools.gr"], brand: "DMK Tools" },
  "fanpharmacy.gr": { expected: ["- fanpharmacy.gr"], brand: "Fan Pharmacy" },
  "powerenergy.gr": { expected: ["- Power Energy"], brand: "Power Energy" },
  "wellbee.gr": { expected: ["- Wellbee Cosmetics"], brand: "Wellbee Cosmetics" },
};

const SPLITS = [
  {
    cardId: "cmtb7i474001904iye9qfchj3",
    expectedMerchantId: "cmtb77cfx0026dkiyp3b4iz9q",
    targetKey: "monkeesofathens.com",
    targetName: "Monkees of Athens",
    targetWebsiteUrl: "https://monkeesofathens.com",
  },
  {
    cardId: "cmtb7i1yu000y04iy1ud2iyk4",
    expectedMerchantId: "cmtb784go0066dkiy5hfgmr1m",
    targetKey: "starlightcinemacrete.com",
    targetName: "Starlight Cinema Crete",
    targetWebsiteUrl: "https://starlightcinemacrete.com",
  },
  {
    cardId: "cmtb77kvs003edkiy6w6lndbt",
    expectedMerchantId: "cmtb6uzla00373giydd6wqbju",
    targetKey: "tennisgarden.gr",
    targetName: "Tennis Garden",
    targetWebsiteUrl: "https://tennisgarden.gr",
  },
  {
    cardId: "cmtb77r83004bdkiycl9k0utt",
    expectedMerchantId: "cmtb6urdq001z3giyx4g2l4dm",
    targetKey: "antithesisclothing.gr",
    targetName: "Antithesis Clothing",
    targetWebsiteUrl: "https://antithesisclothing.gr",
  },
] as const;

const CONTAMINATED_SOURCE_RENAMES = [
  {
    merchantId: "cmtb77cfx0026dkiyp3b4iz9q",
    primaryCardId: "cmtb77ckx0027dkiyltinns4m",
    expected: "DIGITAL GIFT CARD",
    value: "Mix & Match",
  },
  {
    merchantId: "cmtb784go0066dkiy5hfgmr1m",
    primaryCardId: "cmtb784rw0067dkiy87ryq6qs",
    expected: "s",
    value: "Isola Boutique",
  },
  {
    merchantId: "cmtb6uzla00373giydd6wqbju",
    primaryCardId: "cmtb6uzqb00383giyfbh3f5i0",
    expected: "Δωροκάρτες",
    value: "Optika Liolios",
  },
  {
    merchantId: "cmtb6urdq001z3giyx4g2l4dm",
    primaryCardId: "cmtb6urib00203giyzhdgmnv4",
    expected: "Ηλεκτρονική Δωροκάρτα",
    value: "HelloKids",
  },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function host(raw?: string | null) {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function slugify(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseNumber(raw: string) {
  const compact = raw.replace(/\s+/g, "");
  const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(compact)
    ? compact.replace(/[.,]/g, "")
    : compact.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= 10_000 ? value : null;
}

function titleAmounts(value: string) {
  const out = new Set<number>();
  const explicitCurrencyPatterns = [
    /(?:€|eur(?:o)?s?|euro|ευρώ|ευρω|chf|gbp|usd|£|\$)\s*(\d+(?:[.,]\d{1,3})?)/giu,
    /(\d+(?:[.,]\d{1,3})?)\s*(?:€|eur(?:o)?s?|euro|ευρώ|ευρω|chf|gbp|usd|£|\$|e\b|ε\b)/giu,
  ];
  for (const pattern of explicitCurrencyPatterns) {
    for (const match of value.matchAll(pattern)) {
      const parsed = parseNumber(match[1]);
      if (parsed !== null) out.add(parsed);
    }
  }

  const bareGiftAmount =
    /(?:gift\s*(?:card|voucher)|giftcard|δωροκάρτα|δωροκαρτα|δωροεπιταγή|δωροεπιταγη)[^0-9]{0,16}(?<![\p{L}\p{N}])(\d+(?:[.,]\d{1,3})?)(?![\p{L}\p{N}])/giu;
  for (const match of value.matchAll(bareGiftAmount)) {
    const parsed = parseNumber(match[1]);
    if (parsed === null || parsed < 5) continue;
    const matchedPrefix = match[0].slice(0, match[0].length - match[1].length);
    if (/(?:σελίδα|σελιδα|page)\s*$/iu.test(matchedPrefix)) continue;
    out.add(parsed);
  }

  return [...out].sort((a, b) => a - b);
}

function titleHasFormatPollution(title: string) {
  return /(?:\|\s*https?:\/\/|::|gift\s*card\s*-\s*gift\s*card|gif?card_?\d+|(?:σελίδα|σελιδα|page)\s*\d+)/iu.test(title);
}

function titleNeedsCleanup(title: string) {
  return titleAmounts(title).length > 0 || titleHasFormatPollution(title);
}

function genericMerchant(name: string) {
  const value = normalize(name);
  return new Set([
    "gift",
    "gift card",
    "gift voucher",
    "voucher",
    "δωροκαρτα",
    "δωροεπιταγη",
    "digital gift card",
    "ηλεκτρονικη δωροκαρτα",
    "καρτα δωρου",
    "s",
    "други",
  ]).has(value);
}

function merchantPolluted(name: string) {
  return (
    genericMerchant(name) ||
    titleAmounts(name).length > 0 ||
    /^\s*[-–—|]/.test(name) ||
    /\b(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή|δωροεπιταγη)\b/iu.test(
      name,
    )
  );
}

function thirdPartyBrand(title: string, merchant: string) {
  const t = normalize(title);
  const m = normalize(merchant);
  const brands = [
    "nintendo",
    "playstation",
    "xbox",
    "steam",
    "roblox",
    "spotify",
    "netflix",
    "google play",
    "apple",
    "amazon",
    "paysafecard",
  ];
  return brands.find((brand) => t.includes(brand) && !m.includes(brand)) || null;
}

function urlDenominationEvidence(raw: string | null, title: string) {
  if (!raw) return null;
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname).toLowerCase();
    const giftContext = /gift|voucher|δωρο|dorokart|dwrokart|doroepitag|gifcard/.test(pathname);
    if (!giftContext) return null;

    const explicitCurrency = pathname.match(
      /(?:gift|voucher|δωρο|dorokart|dwrokart|doroepitag|gifcard)[^/]{0,40}?(\d+(?:[.,]\d+)?)\s*(?:eur|euro|chf|gbp|usd|e)(?:[-_/]|$)/i,
    );
    if (explicitCurrency) {
      return `URL gift-card segment contains an explicit currency amount (${explicitCurrency[1]}).`;
    }

    const amounts = titleAmounts(title);
    for (const amount of amounts) {
      const token = String(amount).replace(".", "[.,]");
      if (new RegExp(`(?:gift|voucher|δωρο|dorokart|dwrokart|doroepitag|gifcard)[^/]{0,40}${token}(?:[-_/]|$)`, "i").test(pathname)) {
        return `URL gift-card segment repeats the title denomination (${amount}).`;
      }
    }
    return null;
  } catch {
    return "Official URL is invalid.";
  }
}

function generalGiftParent(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    const parts = url.pathname.split("/").filter(Boolean);
    for (let i = parts.length - 2; i >= 0; i--) {
      if (/(?:gift[-_ ]?(?:card|cards|voucher|vouchers)|voucher|δωρο|dwro)/i.test(parts[i])) {
        const candidate = new URL(url.toString());
        candidate.pathname = `/${parts.slice(0, i + 1).join("/")}/`;
        return candidate.toString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function decimalStrings(card: CatalogCard) {
  const out = new Set<string>();
  for (const variant of card.variants) {
    if (variant.minValue !== null) out.add(variant.minValue.toString());
    if (variant.maxValue !== null) out.add(variant.maxValue.toString());
    for (const item of variant.values) out.add(item.value.toString());
  }
  return [...out].sort((a, b) => Number(a) - Number(b));
}

function amountsAreStructured(card: CatalogCard, amounts: number[]) {
  if (!amounts.length) return true;
  for (const amount of amounts) {
    const represented = card.variants.some((variant) => {
      const fixed = variant.values.some((item) => Number(item.value.toString()) === amount);
      const min = variant.minValue === null ? null : Number(variant.minValue.toString());
      const max = variant.maxValue === null ? null : Number(variant.maxValue.toString());
      const ranged = variant.customValueAllowed && min !== null && max !== null && amount >= min && amount <= max;
      return fixed || ranged || min === amount || max === amount;
    });
    if (!represented) return false;
  }
  return true;
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(plan: Plan, outputPath: string) {
  const headers = [
    "kind",
    "type",
    "actionId",
    "cardId",
    "merchantId",
    "merchantName",
    "title",
    "expected",
    "value",
    "officialUrl",
    "issues",
    "reason",
    "evidence",
    "structuredAmounts",
    "relationCounts",
  ];
  const rows: Record<string, unknown>[] = [
    ...plan.actions.map((action) => ({
      kind: "ACTION",
      ...action,
      expected: "expected" in action ? action.expected : "",
      value: "value" in action ? action.value : "targetName" in action ? action.targetName : "",
      evidence: action.evidence,
    })),
    ...plan.reviews.map((review) => ({ kind: "REVIEW", type: "REVIEW", ...review })),
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(outputPath, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function loadCatalog() {
  return prisma.giftCard.findMany({
    where: ACTIVE_ONLY ? { status: { not: "ARCHIVED" } } : undefined,
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }, { id: "asc" }],
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
      updatedAt: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          country: true,
          status: true,
          updatedAt: true,
        },
      },
      variants: {
        select: {
          id: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          values: { select: { value: true }, orderBy: { value: "asc" } },
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
  });
}

type CatalogCard = Awaited<ReturnType<typeof loadCatalog>>[number];

function catalogFingerprint(cards: CatalogCard[]) {
  return hash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      title: card.title,
      slug: card.slug,
      status: card.status,
      verificationStatus: card.verificationStatus,
      officialUrl: card.officialUrl,
      updatedAt: card.updatedAt.toISOString(),
      merchant: {
        id: card.merchant.id,
        name: card.merchant.name,
        slug: card.merchant.slug,
        websiteUrl: card.merchant.websiteUrl,
        updatedAt: card.merchant.updatedAt.toISOString(),
      },
      variants: card.variants.map((variant) => ({
        id: variant.id,
        currency: variant.currency,
        minValue: variant.minValue?.toString() ?? null,
        maxValue: variant.maxValue?.toString() ?? null,
        customValueAllowed: variant.customValueAllowed,
        values: variant.values.map((item) => item.value.toString()),
      })),
      relationCounts: card._count,
    })),
  );
}

function relationCounts(card: CatalogCard) {
  return { ...card._count };
}

function addAction(actions: Action[], action: Action) {
  if (!actions.some((item) => item.actionId === action.actionId)) actions.push(action);
}

function addReview(reviews: Review[], card: CatalogCard, issue: string, reason: string, proposedValue?: string | null) {
  const existing = reviews.find((item) => item.cardId === card.id);
  if (existing) {
    if (!existing.issues.includes(issue)) existing.issues.push(issue);
    existing.reason += ` ${reason}`;
    if (proposedValue && !existing.proposedValue) existing.proposedValue = proposedValue;
    return;
  }
  reviews.push({
    cardId: card.id,
    merchantId: card.merchantId,
    merchantName: card.merchant.name,
    title: card.title,
    officialUrl: card.officialUrl,
    issues: [issue],
    reason,
    proposedValue,
    relationCounts: relationCounts(card),
    structuredAmounts: decimalStrings(card),
  });
}

async function buildPlan(cards: CatalogCard[]): Promise<Plan> {
  const actions: Action[] = [];
  const reviews: Review[] = [];
  const handledCards = new Set<string>();
  const handledMerchants = new Set<string>();
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const cardsByMerchant = new Map<string, CatalogCard[]>();
  for (const card of cards) {
    const group = cardsByMerchant.get(card.merchantId) || [];
    group.push(card);
    cardsByMerchant.set(card.merchantId, group);
  }

  const merchantRows = [...new Map(cards.map((card) => [card.merchant.id, card.merchant])).values()];
  const merchantByHost = new Map<string, typeof merchantRows>();
  for (const merchant of merchantRows) {
    const domain = host(merchant.websiteUrl);
    if (!domain) continue;
    const rows = merchantByHost.get(domain) || [];
    rows.push(merchant);
    merchantByHost.set(domain, rows);
  }
  const reservedSlugs = new Set(merchantRows.map((merchant) => merchant.slug));

  for (const split of SPLITS) {
    const card = cardsById.get(split.cardId);
    if (
      card &&
      host(card.officialUrl) === split.targetKey &&
      host(card.merchant.websiteUrl) === split.targetKey &&
      card.merchant.name === split.targetName
    ) {
      handledCards.add(card.id);
      continue;
    }
    if (!card || card.merchantId !== split.expectedMerchantId || host(card.officialUrl) !== split.targetKey) {
      if (card) {
        addReview(
          reviews,
          card,
          "SPLIT_PRECONDITION_FAILED",
          `Expected merchant ${split.expectedMerchantId} and official host ${split.targetKey}; no split action was planned.`,
        );
      }
      continue;
    }

    const matchingMerchants = (merchantByHost.get(split.targetKey) || []).filter(
      (merchant) => merchant.id !== split.expectedMerchantId,
    );
    if (matchingMerchants.length > 1) {
      addReview(
        reviews,
        card,
        "AMBIGUOUS_TARGET_MERCHANT",
        `Found ${matchingMerchants.length} existing merchants for ${split.targetKey}; no split action was planned.`,
      );
      continue;
    }

    let targetSlug = slugify(split.targetName);
    let suffix = 2;
    while (reservedSlugs.has(targetSlug)) targetSlug = `${slugify(split.targetName)}-${suffix++}`;
    if (!matchingMerchants.length) reservedSlugs.add(targetSlug);

    addAction(actions, {
      type: "ENSURE_MERCHANT",
      actionId: `ensure-merchant:${split.targetKey}`,
      targetKey: split.targetKey,
      targetName: split.targetName,
      targetSlug,
      targetWebsiteUrl: split.targetWebsiteUrl,
      expectedExistingMerchantId: matchingMerchants[0]?.id || null,
      reason: "Explicitly separate a cross-domain card from a contaminated shared merchant.",
      evidence: [
        `card.officialUrl host=${split.targetKey}`,
        `current merchant.websiteUrl host=${host(card.merchant.websiteUrl) || "missing"}`,
      ],
    });
    addAction(actions, {
      type: "REASSIGN_CARD",
      actionId: `reassign-card:${card.id}`,
      cardId: card.id,
      expectedMerchantId: card.merchantId,
      targetKey: split.targetKey,
      targetExistingMerchantId: matchingMerchants[0]?.id || null,
      reason: "Official card URL belongs to a different merchant domain than the shared merchant record.",
      evidence: [card.officialUrl || "", card.merchant.websiteUrl || ""],
    });
    addAction(actions, {
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${card.id}`,
      cardId: card.id,
      merchantId: card.merchantId,
      expected: card.title,
      value: `${split.targetName} Gift Card`,
      reason: "Canonicalize the title after the explicit merchant split.",
      evidence: [card.officialUrl || "", `target merchant=${split.targetName}`],
    });
    handledCards.add(card.id);
  }

  for (const rename of CONTAMINATED_SOURCE_RENAMES) {
    const card = cardsById.get(rename.primaryCardId);
    const group = cardsByMerchant.get(rename.merchantId) || [];
    const splitCount = SPLITS.filter((item) => item.expectedMerchantId === rename.merchantId).length;
    if (
      card &&
      card.merchantId === rename.merchantId &&
      card.merchant.name === rename.value &&
      group.length === 1
    ) {
      handledCards.add(card.id);
      handledMerchants.add(rename.merchantId);
      continue;
    }
    if (
      !card ||
      card.merchantId !== rename.merchantId ||
      card.merchant.name !== rename.expected ||
      group.length !== splitCount + 1
    ) {
      if (card) {
        addReview(
          reviews,
          card,
          "SOURCE_RENAME_PRECONDITION_FAILED",
          "The contaminated merchant group did not match the explicitly audited split shape.",
        );
      }
      continue;
    }
    addAction(actions, {
      type: "UPDATE_MERCHANT_NAME",
      actionId: `update-merchant-name:${rename.merchantId}`,
      merchantId: rename.merchantId,
      cardId: card.id,
      expected: rename.expected,
      value: rename.value,
      reason: "Rename the retained side of an explicitly audited cross-domain merchant split.",
      evidence: [card.officialUrl || "", card.merchant.websiteUrl || ""],
    });
    addAction(actions, {
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${card.id}`,
      cardId: card.id,
      merchantId: card.merchantId,
      expected: card.title,
      value: `${rename.value} Gift Card`,
      reason: "Canonicalize the retained card title after the merchant split.",
      evidence: [card.officialUrl || "", `merchant=${rename.value}`],
    });
    handledCards.add(card.id);
    handledMerchants.add(rename.merchantId);
  }

  for (const [merchantId, group] of cardsByMerchant) {
    if (handledMerchants.has(merchantId)) continue;
    const merchant = group[0].merchant;
    const websiteHost = host(merchant.websiteUrl);
    const officialHosts = new Set(group.map((card) => host(card.officialUrl)).filter(Boolean));
    const recovery = websiteHost ? RECOVERIES[websiteHost] : null;
    if (!recovery || !recovery.expected.includes(merchant.name)) continue;

    const domainConsistent =
      group.length === 1 ||
      (officialHosts.size === 1 && officialHosts.has(websiteHost));
    if (!domainConsistent) {
      for (const card of group) {
        addReview(
          reviews,
          card,
          "MERCHANT_RECOVERY_DOMAIN_CONFLICT",
          "Curated merchant recovery exists, but cards under the merchant span conflicting domains.",
          recovery.brand,
        );
      }
      continue;
    }

    addAction(actions, {
      type: "UPDATE_MERCHANT_NAME",
      actionId: `update-merchant-name:${merchant.id}`,
      merchantId: merchant.id,
      cardId: group[0].id,
      expected: merchant.name,
      value: recovery.brand,
      reason: "Exact current-name plus official-domain recovery from the curated v11 ledger.",
      evidence: [
        `merchant.websiteUrl host=${websiteHost}`,
        ...group.map((card) => card.officialUrl || ""),
      ],
    });

    for (const card of group) {
      const amounts = titleAmounts(card.title);
      const canonicalTitle = `${recovery.brand} Gift Card`;
      if (card.title !== canonicalTitle) {
        if (amountsAreStructured(card, amounts)) {
          addAction(actions, {
            type: "UPDATE_CARD_TITLE",
            actionId: `update-card-title:${card.id}`,
            cardId: card.id,
            merchantId: card.merchantId,
            expected: card.title,
            value: canonicalTitle,
            reason: "Canonicalize the title after exact merchant recovery; any removed denomination is represented structurally.",
            evidence: [
              card.officialUrl || "",
              `title amounts=${amounts.join("|") || "none"}`,
              `structured amounts=${decimalStrings(card).join("|") || "none"}`,
            ],
          });
        } else {
          addReview(
            reviews,
            card,
            "TITLE_AMOUNT_NOT_STRUCTURED",
            "Merchant recovery is safe, but the amount-bearing title is retained because its denomination is not represented structurally.",
            canonicalTitle,
          );
        }
      }
      handledCards.add(card.id);
    }
    handledMerchants.add(merchantId);
  }

  for (const card of cards) {
    if (handledCards.has(card.id)) continue;
    const thirdParty = thirdPartyBrand(card.title, card.merchant.name);
    if (thirdParty) {
      addReview(
        reviews,
        card,
        "THIRD_PARTY_CARD",
        `Title references ${thirdParty}, which is not supported by the merchant identity; title was not rewritten.`,
      );
      continue;
    }

    if (titleNeedsCleanup(card.title)) {
      const amounts = titleAmounts(card.title);
      const canonicalTitle = `${card.merchant.name} Gift Card`;
      if (card.title !== canonicalTitle) {
        if (amountsAreStructured(card, amounts)) {
          addAction(actions, {
            type: "UPDATE_CARD_TITLE",
            actionId: `update-card-title:${card.id}`,
            cardId: card.id,
            merchantId: card.merchantId,
            expected: card.title,
            value: canonicalTitle,
            reason: "Remove denomination/format pollution only after confirming structured value coverage.",
            evidence: [
              `title amounts=${amounts.join("|") || "format-only"}`,
              `structured amounts=${decimalStrings(card).join("|") || "none"}`,
            ],
          });
        } else {
          addReview(
            reviews,
            card,
            "TITLE_AMOUNT_NOT_STRUCTURED",
            "Amount-bearing title was not rewritten because at least one denomination is missing from variants/values.",
            canonicalTitle,
          );
        }
      }
    }

    if (merchantPolluted(card.merchant.name)) {
      addReview(
        reviews,
        card,
        "UNRESOLVED_MERCHANT_NAME",
        "Merchant name appears generic/polluted and has no exact curated recovery decision.",
      );
    }
  }

  const plannedSplitMerchantIds = new Set(SPLITS.map((item) => item.expectedMerchantId));
  for (const [merchantId, group] of cardsByMerchant) {
    if (group.length < 2 || plannedSplitMerchantIds.has(merchantId)) continue;
    const officialHosts = new Set(group.map((card) => host(card.officialUrl)).filter(Boolean));
    const exactUrls = new Map<string, number>();
    for (const card of group) {
      const key = card.officialUrl || "missing";
      exactUrls.set(key, (exactUrls.get(key) || 0) + 1);
    }
    const issue = [...exactUrls.values()].some((count) => count > 1)
      ? "EXACT_URL_DUPLICATE_CLUSTER"
      : officialHosts.size > 1
        ? "CROSS_DOMAIN_MERCHANT_CLUSTER"
        : "POSSIBLE_DUPLICATE_PROGRAM";
    for (const card of group) {
      addReview(
        reviews,
        card,
        issue,
        `Merchant has ${group.length} cards; no merge/archive action is planned without a relation-aware keeper decision.`,
      );
    }
  }

  for (const card of cards) {
    const evidence = urlDenominationEvidence(card.officialUrl, card.title);
    if (!evidence) continue;
    addReview(
      reviews,
      card,
      "DENOMINATION_SPECIFIC_URL",
      `${evidence} URL remains unchanged until its parent is independently validated.`,
      generalGiftParent(card.officialUrl),
    );
  }

  actions.sort((a, b) => {
    const order: Record<Action["type"], number> = {
      ENSURE_MERCHANT: 0,
      REASSIGN_CARD: 1,
      UPDATE_MERCHANT_NAME: 2,
      UPDATE_CARD_TITLE: 3,
    };
    return order[a.type] - order[b.type] || a.actionId.localeCompare(b.actionId);
  });
  reviews.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.title.localeCompare(b.title));
  for (const review of reviews) review.issues.sort();

  const cardsWithActions = new Set(
    actions.flatMap((action) => {
      if ("cardId" in action) return [action.cardId];
      return [];
    }),
  );
  const cardsWithReview = new Set(reviews.map((review) => review.cardId));
  const touched = new Set([...cardsWithActions, ...cardsWithReview]);
  const byAction: Record<string, number> = {};
  for (const action of actions) byAction[action.type] = (byAction[action.type] || 0) + 1;
  const byReviewIssue: Record<string, number> = {};
  for (const review of reviews) {
    for (const issue of review.issues) byReviewIssue[issue] = (byReviewIssue[issue] || 0) + 1;
  }

  const fingerprint = catalogFingerprint(cards);
  const base = {
    version: 11 as const,
    scope: ACTIVE_ONLY ? ("NON_ARCHIVED" as const) : ("ALL" as const),
    totalCards: cards.length,
    catalogFingerprint: fingerprint,
    actions,
    reviews,
  };
  const planId = hash(base);
  return {
    version: 11,
    generatedAt: new Date().toISOString(),
    mode: "PREVIEW",
    scope: base.scope,
    totalCards: cards.length,
    catalogFingerprint: fingerprint,
    planId,
    summary: {
      actions: actions.length,
      cardsWithActions: cardsWithActions.size,
      cardsWithReview: cardsWithReview.size,
      cleanUnaffected: cards.length - touched.size,
      byAction,
      byReviewIssue,
    },
    actions,
    reviews,
  };
}

function verifyStoredPlanId(plan: Plan) {
  const expected = hash({
    version: plan.version,
    scope: plan.scope,
    totalCards: plan.totalCards,
    catalogFingerprint: plan.catalogFingerprint,
    actions: plan.actions,
    reviews: plan.reviews,
  });
  if (expected !== plan.planId) throw new Error("Stored plan contents do not match planId.");
}

async function applyPlan(plan: Plan, currentCards: CatalogCard[]) {
  if (!REQUESTED_PLAN_ID) {
    throw new Error("Apply requires --plan-id=<preview planId>.");
  }
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error(`Requested planId ${REQUESTED_PLAN_ID} does not match stored planId ${plan.planId}.`);
  }
  verifyStoredPlanId(plan);
  const currentFingerprint = catalogFingerprint(currentCards);
  if (currentFingerprint !== plan.catalogFingerprint) {
    throw new Error("Catalog fingerprint changed after preview. Regenerate and review a new plan.");
  }

  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      const targetMerchantIds = new Map<string, string>();
      for (const action of plan.actions) {
        if (action.type === "ENSURE_MERCHANT") {
          if (action.expectedExistingMerchantId) {
            const existing = await tx.merchant.findUnique({
              where: { id: action.expectedExistingMerchantId },
              select: { id: true, name: true, websiteUrl: true },
            });
            if (!existing || host(existing.websiteUrl) !== action.targetKey) {
              throw new Error(`Existing target merchant precondition failed for ${action.actionId}.`);
            }
            targetMerchantIds.set(action.targetKey, existing.id);
            applied.push({ actionId: action.actionId, result: "REUSED", merchantId: existing.id });
            continue;
          }
          const slugCollision = await tx.merchant.findUnique({
            where: { slug: action.targetSlug },
            select: { id: true },
          });
          if (slugCollision) throw new Error(`Merchant slug collision for ${action.targetSlug}.`);
          const created = await tx.merchant.create({
            data: {
              name: action.targetName,
              slug: action.targetSlug,
              websiteUrl: action.targetWebsiteUrl,
            },
            select: { id: true },
          });
          targetMerchantIds.set(action.targetKey, created.id);
          applied.push({ actionId: action.actionId, result: "CREATED", merchantId: created.id });
          continue;
        }

        if (action.type === "REASSIGN_CARD") {
          const targetMerchantId =
            action.targetExistingMerchantId || targetMerchantIds.get(action.targetKey);
          if (!targetMerchantId) throw new Error(`No target merchant resolved for ${action.actionId}.`);
          const result = await tx.giftCard.updateMany({
            where: { id: action.cardId, merchantId: action.expectedMerchantId },
            data: { merchantId: targetMerchantId },
          });
          if (result.count !== 1) throw new Error(`Reassign precondition failed for ${action.actionId}.`);
          applied.push({ actionId: action.actionId, result: "UPDATED", targetMerchantId });
          continue;
        }

        if (action.type === "UPDATE_MERCHANT_NAME") {
          const result = await tx.merchant.updateMany({
            where: { id: action.merchantId, name: action.expected },
            data: { name: action.value },
          });
          if (result.count !== 1) throw new Error(`Merchant-name precondition failed for ${action.actionId}.`);
          applied.push({ actionId: action.actionId, result: "UPDATED" });
          continue;
        }

        const result = await tx.giftCard.updateMany({
          where: { id: action.cardId, title: action.expected },
          data: { title: action.value },
        });
        if (result.count !== 1) throw new Error(`Card-title precondition failed for ${action.actionId}.`);
        applied.push({ actionId: action.actionId, result: "UPDATED" });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );

  fs.writeFileSync(
    APPLY_LOG,
    `${JSON.stringify(
      {
        version: 11,
        appliedAt: new Date().toISOString(),
        planId: plan.planId,
        catalogFingerprintBefore: plan.catalogFingerprint,
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

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY && ACTIVE_ONLY) throw new Error("--active-only is read-only and cannot be combined with --apply.");
  if (APPLY) {
    if (!fs.existsSync(PLAN_JSON)) throw new Error(`Preview plan not found: ${PLAN_JSON}`);
    const storedPlan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")) as Plan;
    const currentCards = await loadCatalog();
    const applied = await applyPlan(storedPlan, currentCards);
    console.log("Dorokartes Full-Catalog Cleanup v11 — APPLY");
    console.log(`Plan ID: ${storedPlan.planId}`);
    console.log(`Applied actions: ${applied.length}`);
    console.log(`Apply log: ${APPLY_LOG}`);
    return;
  }

  const cards = await loadCatalog();
  const plan = await buildPlan(cards);
  const outputJson = POST_AUDIT
    ? ACTIVE_ONLY
      ? ACTIVE_POST_AUDIT_JSON
      : POST_AUDIT_JSON
    : PLAN_JSON;
  const outputCsv = POST_AUDIT
    ? ACTIVE_ONLY
      ? ACTIVE_POST_AUDIT_CSV
      : POST_AUDIT_CSV
    : PLAN_CSV;
  fs.writeFileSync(outputJson, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan, outputCsv);

  console.log(`Dorokartes Full-Catalog Cleanup v11 — ${POST_AUDIT ? "POST-AUDIT" : "PREVIEW"}`);
  console.log(`Scope: ${plan.scope}`);
  console.log(`Cards scanned: ${plan.totalCards}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Actions: ${plan.summary.actions} across ${plan.summary.cardsWithActions} cards`);
  for (const [type, count] of Object.entries(plan.summary.byAction)) console.log(`  ${type}: ${count}`);
  console.log(`Residual review: ${plan.summary.cardsWithReview} cards`);
  for (const [issue, count] of Object.entries(plan.summary.byReviewIssue)) console.log(`  ${issue}: ${count}`);
  console.log(`Clean/untouched: ${plan.summary.cleanUnaffected}`);
  console.log(`JSON report: ${outputJson}`);
  console.log(`CSV report:  ${outputCsv}`);
  console.log(POST_AUDIT ? "READ-ONLY POST-AUDIT — database unchanged." : "PREVIEW ONLY — database unchanged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
