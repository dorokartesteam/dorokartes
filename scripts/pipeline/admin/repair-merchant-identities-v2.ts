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
  "merchant-identity-evidence-v1-67e1de168e8b4a64.json",
);
const PLAN_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v2-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "merchant-identity-repair-v2-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v2-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "merchant-identity-repair-v2-post-audit.json");

type EvidenceSource =
  | "HOME_JSONLD_ORGANIZATION"
  | "HOME_OG_SITE_NAME"
  | "HOME_LOGO_ALT"
  | "HOME_TITLE"
  | "GIFT_JSONLD_BRAND"
  | "GIFT_JSONLD_ORGANIZATION"
  | "GIFT_OG_SITE_NAME"
  | "GIFT_LOGO_ALT"
  | "GIFT_TITLE";

type Candidate = {
  value: string;
  normalizedValue: string;
  score: number;
  sources: EvidenceSource[];
  sourceUrls: string[];
};

type Finding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string | null;
  giftCardId: string;
  giftCardTitle: string;
  officialUrl: string | null;
  status: "CANDIDATE" | "REVIEW" | "ERROR";
  reasonCodes: string[];
  candidates: Candidate[];
};

type SourceReport = {
  version: "merchant-identity-evidence-v1";
  mode: "READ_ONLY_EVIDENCE";
  reportId: string;
  findings: Finding[];
};

type Specification = {
  merchantId: string;
  expectedMerchantName: string;
  merchantNameAfter: string;
  titleAfter: string;
  evidenceCandidate: string;
  minimumEvidenceScore: number;
  requiredEvidenceSources: EvidenceSource[];
  rationale: string;
};

const SPECIFICATIONS: readonly Specification[] = [
  {
    merchantId: "cmtb77rj8004cdkiyvmogo621",
    expectedMerchantName: "Christmas Gift Cards",
    merchantNameAfter: "Armonia Wellness",
    titleAfter: "Armonia Wellness Christmas Gift Card",
    evidenceCandidate: "Armonia Wellness",
    minimumEvidenceScore: 295,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Preserve the Christmas-specific program while restoring the official merchant identity.",
  },
  {
    merchantId: "cmtb78g7m007rdkiydh03gkcd",
    expectedMerchantName: "I Thought Of You",
    merchantNameAfter: "ΥΜΩΝ",
    titleAfter: "ΥΜΩΝ – I Thought Of You Gift Card",
    evidenceCandidate: "ΥΜΩΝ",
    minimumEvidenceScore: 280,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Keep the named gift-card product and restore the official merchant identity.",
  },
  {
    merchantId: "cmtb78ft1007pdkiylxlrso3f",
    expectedMerchantName: "Make a gift",
    merchantNameAfter: "Simclub",
    titleAfter: "Simclub Gift Card",
    evidenceCandidate: "Simclub",
    minimumEvidenceScore: 245,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Replace generic page copy with the official site identity.",
  },
  {
    merchantId: "cmtb7i3a3001504iyg9dda4td",
    expectedMerchantName: "Massage Gift Cards Kefalonia",
    merchantNameAfter: "4 Elements Massage Kefalonia",
    titleAfter: "4 Elements Massage Kefalonia Gift Card",
    evidenceCandidate: "4 Elements Massage Kefalonia",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Replace product-page copy with the corroborated official identity.",
  },
  {
    merchantId: "cmtb77g6g002qdkiyzp7xmoyn",
    expectedMerchantName: "Paco Δωροκάρτες από",
    merchantNameAfter: "Paco Art Center",
    titleAfter: "Paco Art Center Gift Card",
    evidenceCandidate: "Paco Art Center",
    minimumEvidenceScore: 195,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Remove scraped purchase-page wording from the merchant and card title.",
  },
  {
    merchantId: "cmtb7hz7e000k04iywfxqpaau",
    expectedMerchantName: "Unforgettable Experience Gift Cards in Greece",
    merchantNameAfter: "Explore Messinia",
    titleAfter: "Explore Messinia Gift Card",
    evidenceCandidate: "Explore Messinia - Outdoor activities",
    minimumEvidenceScore: 195,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Use the brand portion of the identical official site-name signal from both pages.",
  },
  {
    merchantId: "cmtb7i4fg001a04iyu5nzeowe",
    expectedMerchantName: "Wellness Gift Cards",
    merchantNameAfter: "Om Home",
    titleAfter: "Om Home Gift Card",
    evidenceCandidate: "Om Home",
    minimumEvidenceScore: 230,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_OG_SITE_NAME"],
    rationale: "Replace a generic card category with the official business identity.",
  },
  {
    merchantId: "cmtb780lh005odkiyslzjq17k",
    expectedMerchantName: "Αγόρασε μία Δωροκάρτα",
    merchantNameAfter: "Dazzeal",
    titleAfter: "Dazzeal Gift Card",
    evidenceCandidate: "Dazzeal",
    minimumEvidenceScore: 255,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_LOGO_ALT"],
    rationale: "Replace voucher-form copy with the official identity.",
  },
  {
    merchantId: "cmtb6upwi001r3giymvuh6njo",
    expectedMerchantName: "Αγοράστε μία Δωροεπιταγή - Gifts 4 All",
    merchantNameAfter: "Gifts 4 All",
    titleAfter: "Gifts 4 All Gift Card",
    evidenceCandidate: "Gifts 4 All",
    minimumEvidenceScore: 255,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_LOGO_ALT"],
    rationale: "Retain only the corroborated merchant identity.",
  },
  {
    merchantId: "cmtb782qf005ydkiyrxvghjux",
    expectedMerchantName: "Αγοράστε μία Δωροκάρτα",
    merchantNameAfter: "Fifth Element",
    titleAfter: "Fifth Element Gift Card",
    evidenceCandidate: "Fifth Element - Adventure Store",
    minimumEvidenceScore: 170,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "HOME_LOGO_ALT"],
    rationale: "Use the brand portion of the official organization and logo identity.",
  },
  {
    merchantId: "cmtb789nc006vdkiyyrzeqiov",
    expectedMerchantName: "Δωροεπιταγές",
    merchantNameAfter: "Must Men Fashion",
    titleAfter: "Must Men Fashion Gift Card",
    evidenceCandidate: "Must Men Fashion",
    minimumEvidenceScore: 355,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Replace a generic plural label with the official merchant identity.",
  },
  {
    merchantId: "cmta4ym53001qsciyl81j3zu5",
    expectedMerchantName: "Δωροκάρτα - Karfitsomenos Gatos",
    merchantNameAfter: "Karfitsomenos Gatos",
    titleAfter: "Karfitsomenos Gatos Gift Card",
    evidenceCandidate: "Karfitsomenos Gatos",
    minimumEvidenceScore: 280,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_OG_SITE_NAME"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmta4yyrf0038sciyxex3eik0",
    expectedMerchantName: "Δωροκάρτα - Patousaki Shoes",
    merchantNameAfter: "Patousaki Shoes",
    titleAfter: "Patousaki Shoes Gift Card",
    evidenceCandidate: "Patousaki Shoes",
    minimumEvidenceScore: 330,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmtb6v1hi003h3giyzn8glzoz",
    expectedMerchantName: "ΔΩΡΟΚΑΡΤΑ - Pregnancy-gifts.gr",
    merchantNameAfter: "Pregnancy Gifts",
    titleAfter: "Pregnancy Gifts Gift Card",
    evidenceCandidate: "Pregnancy Gifts",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Use the official identity without the product prefix or domain suffix.",
  },
  {
    merchantId: "cmta4z43r003usciyabwwtw93",
    expectedMerchantName: "Δωροκάρτα - Studio Fix",
    merchantNameAfter: "Studiofix",
    titleAfter: "Studiofix Gift Card",
    evidenceCandidate: "Studiofix",
    minimumEvidenceScore: 255,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Use the official site identity without the product prefix.",
  },
  {
    merchantId: "cmta4z7n90048sciy1ngsw7es",
    expectedMerchantName: "Δωροκάρτα - Vibrant Beauty",
    merchantNameAfter: "Vibrant Beauty",
    titleAfter: "Vibrant Beauty Gift Card",
    evidenceCandidate: "Vibrant Beauty",
    minimumEvidenceScore: 245,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmta4z5jo0040sciyob5ul4bs",
    expectedMerchantName: "Δωροκάρτα – Uba | Clothing & Massage Oils",
    merchantNameAfter: "Uba",
    titleAfter: "Uba Gift Card",
    evidenceCandidate: "Uba | Clothing & Massage Oils",
    minimumEvidenceScore: 195,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Use the brand portion of the matching official site-name signal.",
  },
  {
    merchantId: "cmta4ya8v000esciy4fwqlr55",
    expectedMerchantName: "Δωροκάρτα Best Wines - Κάβα κρασιών Best Wines",
    merchantNameAfter: "Best Wines",
    titleAfter: "Best Wines Gift Card",
    evidenceCandidate: "Best Wines",
    minimumEvidenceScore: 330,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Remove product and SEO wording from the merchant identity.",
  },
  {
    merchantId: "cmta4yfnr0010sciyekibu4i4",
    expectedMerchantName: "Δωροκάρτα Evilio Home",
    merchantNameAfter: "Evilio Home",
    titleAfter: "Evilio Home Gift Card",
    evidenceCandidate: "Evilio Home",
    minimumEvidenceScore: 295,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmta4yrrv002esciypbuxrrtw",
    expectedMerchantName: "Δωροκάρτα Love Generation",
    merchantNameAfter: "Love Generation",
    titleAfter: "Love Generation Gift Card",
    evidenceCandidate: "Love Generation",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmtb6v4em003x3giyg8ll7r7u",
    expectedMerchantName: "Δωροκάρτα Spaghetti Lab",
    merchantNameAfter: "Spaghetti Lab",
    titleAfter: "Spaghetti Lab Gift Card",
    evidenceCandidate: "Spaghetti Lab",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Separate merchant identity from product type.",
  },
  {
    merchantId: "cmta4z8an004asciy12oao0hi",
    expectedMerchantName: "Δωροκάρτα Vip Art",
    merchantNameAfter: "VIP Art",
    titleAfter: "VIP Art Gift Card",
    evidenceCandidate: "VIP Art",
    minimumEvidenceScore: 195,
    requiredEvidenceSources: ["HOME_OG_SITE_NAME", "GIFT_OG_SITE_NAME"],
    rationale: "Use the official site-name styling without the product prefix.",
  },
  {
    merchantId: "cmta4ydov000ssciyj77w8hqs",
    expectedMerchantName: "Δωροκάρτα Πλυντηρίου - Cityzen",
    merchantNameAfter: "Cityzen",
    titleAfter: "Cityzen Car Wash Gift Card",
    evidenceCandidate: "Cityzen",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Restore the official merchant identity and retain the service context in the card title.",
  },
  {
    merchantId: "cmta4yf3d000ysciy2zdlqyzw",
    expectedMerchantName: "Ηλεκτρονική Δωροκάρτα - SportCafe",
    merchantNameAfter: "SportCafe",
    titleAfter: "SportCafe Gift Card",
    evidenceCandidate: "SportCafe",
    minimumEvidenceScore: 355,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Separate merchant identity from delivery format and product type.",
  },
  {
    merchantId: "cmtb6v0pz003d3giypgi6p23y",
    expectedMerchantName: "Ηλεκτρονική Δωροκάρτα PlanToys",
    merchantNameAfter: "PlanToys Greece",
    titleAfter: "PlanToys Greece Gift Card",
    evidenceCandidate: "PlanToys Greece",
    minimumEvidenceScore: 205,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Use the specific official organization identity without the product prefix.",
  },
  {
    merchantId: "cmtb77i700030dkiywamhlbp4",
    expectedMerchantName: "Κάρτα δώρου για Εκδρομές - Περιηγήσεις στα Χανιά Κρήτης",
    merchantNameAfter: "Proper Cretan Guide",
    titleAfter: "Proper Cretan Guide Gift Card",
    evidenceCandidate: "Proper Cretan Guide",
    minimumEvidenceScore: 280,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Replace the product description with the official operator identity.",
  },
  {
    merchantId: "cmta4z1g8003ksciycb0lyswx",
    expectedMerchantName: "Κάρτα Δώρου Εστιατόριο | Salero Restaurant",
    merchantNameAfter: "Salero Restaurant",
    titleAfter: "Salero Restaurant Gift Card",
    evidenceCandidate: "Salero Restaurant",
    minimumEvidenceScore: 255,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_OG_SITE_NAME"],
    rationale: "Remove the product descriptor from the official restaurant identity.",
  },
  {
    merchantId: "cmtb6uuev002f3giyv39kjoxr",
    expectedMerchantName: "Μασάζ L'Arte di Massaggio -",
    merchantNameAfter: "L'Arte di Massaggio",
    titleAfter: "L'Arte di Massaggio Gift Card",
    evidenceCandidate: "L'arte di Massaggio",
    minimumEvidenceScore: 280,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Remove the service prefix and dangling punctuation; preserve the official brand wording.",
  },
  {
    merchantId: "cmtb771uj000odkiywhfjulaj",
    expectedMerchantName: "Προσφέρετε μια δωροκάρτα - Επιλέξτε την Αξία",
    merchantNameAfter: "Delta Restaurant",
    titleAfter: "Delta Restaurant Gift Card",
    evidenceCandidate: "Delta Restaurant",
    minimumEvidenceScore: 305,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "GIFT_JSONLD_ORGANIZATION"],
    rationale: "Replace gift-card form instructions with the official restaurant identity.",
  },
  {
    merchantId: "cmtb6um3e00183giyblwki1yw",
    expectedMerchantName: "Χάρισε μια Δωροκάρτα - District75",
    merchantNameAfter: "District 75",
    titleAfter: "District 75 Gift Card",
    evidenceCandidate: "District 75",
    minimumEvidenceScore: 255,
    requiredEvidenceSources: ["HOME_JSONLD_ORGANIZATION", "HOME_OG_SITE_NAME"],
    rationale: "Remove purchase copy and use the official site identity.",
  },
] as const;

type Target = Awaited<ReturnType<typeof loadTargets>>[number];

type Action = {
  type: "UPDATE_MERCHANT_NAME" | "UPDATE_CARD_TITLE";
  actionId: string;
  merchantId: string;
  giftCardId: string;
  expected: string;
  value: string;
  evidenceCandidate: string;
  evidenceScore: number;
  evidenceSources: EvidenceSource[];
  evidenceUrls: string[];
  rationale: string;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  sourceEvidenceFingerprint: string;
  targetFingerprint: string;
  planId: string;
  targetCount: number;
  actionCount: number;
  unchangedFields: string[];
  actions: Action[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers: Array<keyof Action> = [
    "type",
    "actionId",
    "merchantId",
    "giftCardId",
    "expected",
    "value",
    "evidenceCandidate",
    "evidenceScore",
    "evidenceSources",
    "evidenceUrls",
    "rationale",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) => headers.map((header) => csvEscape(action[header])).join(",")),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

function validateSource(source: SourceReport) {
  if (
    source.version !== "merchant-identity-evidence-v1" ||
    source.mode !== "READ_ONLY_EVIDENCE" ||
    source.reportId !== "67e1de168e8b4a642c360a18a84d3889d54ca9ab39d9529593471ea25101072d"
  ) {
    throw new Error("Unexpected merchant-identity evidence report.");
  }
  const validated = SPECIFICATIONS.map((specification) => {
    const finding = source.findings.find((item) => item.merchantId === specification.merchantId);
    if (
      !finding ||
      finding.status !== "CANDIDATE" ||
      finding.merchantName !== specification.expectedMerchantName
    ) {
      throw new Error(`Source precondition failed for merchant ${specification.merchantId}.`);
    }
    const candidate = finding.candidates.find(
      (item) => item.value === specification.evidenceCandidate,
    );
    if (
      !candidate ||
      candidate.score < specification.minimumEvidenceScore ||
      !specification.requiredEvidenceSources.every((sourceName) =>
        candidate.sources.includes(sourceName),
      ) ||
      candidate.sourceUrls.length === 0
    ) {
      throw new Error(`Evidence threshold failed for merchant ${specification.merchantId}.`);
    }
    return { specification, finding, candidate };
  });
  if (new Set(validated.map(({ finding }) => finding.giftCardId)).size !== validated.length) {
    throw new Error("Duplicate gift-card target in identity repair specification.");
  }
  return validated;
}

async function loadTargets() {
  return prisma.merchant.findMany({
    where: { id: { in: SPECIFICATIONS.map((item) => item.merchantId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      status: true,
      updatedAt: true,
      giftCards: {
        where: { status: "ACTIVE" },
        orderBy: { id: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          officialUrl: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });
}

function serializeTargets(targets: Target[]) {
  return targets.map((target) => ({
    ...target,
    updatedAt: target.updatedAt.toISOString(),
    giftCards: target.giftCards.map((card) => ({
      ...card,
      updatedAt: card.updatedAt.toISOString(),
    })),
  }));
}

function validateTargets(
  targets: Target[],
  sourceEvidence: ReturnType<typeof validateSource>,
) {
  if (targets.length !== SPECIFICATIONS.length) {
    throw new Error(`Expected ${SPECIFICATIONS.length} merchants, found ${targets.length}.`);
  }
  for (const { specification, finding } of sourceEvidence) {
    const target = targets.find((item) => item.id === specification.merchantId);
    const card = target?.giftCards[0];
    if (
      !target ||
      target.name !== specification.expectedMerchantName ||
      target.slug !== finding.merchantSlug ||
      target.websiteUrl !== finding.websiteUrl ||
      target.status !== "ACTIVE" ||
      target.giftCards.length !== 1 ||
      !card ||
      card.id !== finding.giftCardId ||
      card.title !== finding.giftCardTitle ||
      card.slug.length === 0 ||
      card.officialUrl !== finding.officialUrl ||
      card.status !== "ACTIVE"
    ) {
      throw new Error(`Database precondition failed for merchant ${specification.merchantId}.`);
    }
  }
  return targets;
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  if (stableHash(planMaterial(material)) !== plan.planId) {
    throw new Error("Stored plan ID is invalid.");
  }
}

function assertPlanRequest(plan: Plan) {
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID) throw new Error("Apply/post-audit requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function buildPlan() {
  const source = readJson<SourceReport>(SOURCE_REPORT);
  const sourceEvidence = validateSource(source);
  const targets = validateTargets(await loadTargets(), sourceEvidence);
  const actions: Action[] = sourceEvidence.flatMap(({ specification, finding, candidate }) => [
    {
      type: "UPDATE_MERCHANT_NAME",
      actionId: `update-merchant-name:${finding.merchantId}`,
      merchantId: finding.merchantId,
      giftCardId: finding.giftCardId,
      expected: finding.merchantName,
      value: specification.merchantNameAfter,
      evidenceCandidate: candidate.value,
      evidenceScore: candidate.score,
      evidenceSources: candidate.sources,
      evidenceUrls: candidate.sourceUrls,
      rationale: specification.rationale,
    },
    {
      type: "UPDATE_CARD_TITLE",
      actionId: `update-card-title:${finding.giftCardId}`,
      merchantId: finding.merchantId,
      giftCardId: finding.giftCardId,
      expected: finding.giftCardTitle,
      value: specification.titleAfter,
      evidenceCandidate: candidate.value,
      evidenceScore: candidate.score,
      evidenceSources: candidate.sources,
      evidenceUrls: candidate.sourceUrls,
      rationale: specification.rationale,
    },
  ]);
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    sourceEvidenceFingerprint: stableHash(sourceEvidence),
    targetFingerprint: stableHash(serializeTargets(targets)),
    targetCount: SPECIFICATIONS.length,
    actionCount: actions.length,
    unchangedFields: [
      "Merchant.slug",
      "Merchant.websiteUrl",
      "GiftCard.slug",
      "GiftCard.officialUrl",
    ],
    actions,
  };
  const plan: Plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-identity-repair-v2-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(actions);
  return plan;
}

async function applyPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const sourceEvidence = validateSource(readJson<SourceReport>(SOURCE_REPORT));
  if (stableHash(sourceEvidence) !== plan.sourceEvidenceFingerprint) {
    throw new Error("Source evidence changed after preview.");
  }
  const targets = validateTargets(await loadTargets(), sourceEvidence);
  if (stableHash(serializeTargets(targets)) !== plan.targetFingerprint) {
    throw new Error("Database state changed after preview.");
  }
  await prisma.$transaction(
    async (tx) => {
      for (const { specification, finding } of sourceEvidence) {
        const merchantResult = await tx.merchant.updateMany({
          where: {
            id: specification.merchantId,
            name: specification.expectedMerchantName,
            slug: finding.merchantSlug,
            websiteUrl: finding.websiteUrl,
            status: "ACTIVE",
          },
          data: { name: specification.merchantNameAfter },
        });
        if (merchantResult.count !== 1) {
          throw new Error(`Merchant update failed for ${specification.merchantId}.`);
        }
        const cardResult = await tx.giftCard.updateMany({
          where: {
            id: finding.giftCardId,
            merchantId: specification.merchantId,
            title: finding.giftCardTitle,
            officialUrl: finding.officialUrl,
            status: "ACTIVE",
          },
          data: { title: specification.titleAfter },
        });
        if (cardResult.count !== 1) {
          throw new Error(`Gift-card update failed for ${finding.giftCardId}.`);
        }
      }
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 120_000 },
  );
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    targetCount: plan.targetCount,
    appliedActions: plan.actionCount,
    changedFields: ["Merchant.name", "GiftCard.title"],
    unchangedFields: plan.unchangedFields,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-identity-repair-v2-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function postAudit() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const source = readJson<SourceReport>(SOURCE_REPORT);
  const sourceEvidence = validateSource(source);
  const targets = await loadTargets();
  const checks = sourceEvidence.map(({ specification, finding }) => {
    const target = targets.find((item) => item.id === specification.merchantId);
    const card = target?.giftCards.find((item) => item.id === finding.giftCardId);
    return {
      merchantId: specification.merchantId,
      giftCardId: finding.giftCardId,
      passed:
        Boolean(target && card) &&
        target?.name === specification.merchantNameAfter &&
        target?.slug === finding.merchantSlug &&
        target?.websiteUrl === finding.websiteUrl &&
        target?.status === "ACTIVE" &&
        target?.giftCards.length === 1 &&
        card?.title === specification.titleAfter &&
        card?.officialUrl === finding.officialUrl &&
        card?.status === "ACTIVE",
      merchantName: target?.name || null,
      cardTitle: card?.title || null,
      immutableUrlsAndSlugs:
        target?.slug === finding.merchantSlug &&
        target?.websiteUrl === finding.websiteUrl &&
        card?.officialUrl === finding.officialUrl,
    };
  });
  const passed = checks.length === SPECIFICATIONS.length && checks.every((check) => check.passed);
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    passed,
    checkedTargets: checks.length,
    databaseWrites: 0,
    checks,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(
      REPORT_DIR,
      `merchant-identity-repair-v2-post-audit-${plan.planId.slice(0, 16)}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (!passed) throw new Error("Merchant identity repair post-audit failed.");
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) {
    const report = await applyPlan();
    console.log("Dorokartes Merchant Identity Repair v2 — APPLY");
    console.log(`Plan ID: ${report.planId}`);
    console.log(`Targets: ${report.targetCount}`);
    console.log(`Applied actions: ${report.appliedActions}`);
    return;
  }
  if (POST_AUDIT) {
    const report = await postAudit();
    console.log("Dorokartes Merchant Identity Repair v2 — POST-AUDIT");
    console.log(`Checked targets: ${report.checkedTargets}`);
    console.log(`Passed: ${report.passed}`);
    return;
  }
  const plan = await buildPlan();
  console.log("Dorokartes Merchant Identity Repair v2 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
