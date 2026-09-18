import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "catalog-recipient-mapping-v4" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv
  .find((argument) => argument.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const RESIDUAL_AUDIT_JSON = path.join(
  REPORT_DIR,
  "full-catalog-cleanup-v11-active-post-audit.json",
);

const GIFT = String.raw`(?:gift\s*(?:card|cards|voucher|vouchers)|e\s*gift\s*card|voucher|dorokart[\w]*|dwrokart[\w]*|doroepitag[\w]*|δωροκαρτ[α-ω]*|δωροεπιταγ[α-ω]*)`;
const RULES = [
  {
    id: "identity-for-her-explicit-v1",
    slug: "for-her",
    term: String.raw`(?:for\s+(?:her|women)|για\s+(?:γυναικα|γυναικες|εκεινη)|γυναικεια|γυναικειο|γυναικειες)`,
    category: null,
  },
  {
    id: "identity-for-him-explicit-v1",
    slug: "for-him",
    term: String.raw`(?:for\s+(?:him|men)|για\s+(?:ανδρα|ανδρες|εκεινον)|ανδρικα|ανδρικη|ανδρικο)`,
    category: null,
  },
  {
    id: "identity-for-kids-explicit-v1",
    slug: "for-kids",
    term: String.raw`(?:for\s+(?:kids|children)|ideas\s+for\s+kids|kids?\s+(?:fashion|clothing|wear)|για\s+παιδ[α-ω]*|παιδικα|παιδικες|παιδικο|παιδια|παιδι)`,
    category: "kids-baby",
  },
  {
    id: "identity-new-baby-explicit-v1",
    slug: "new-baby",
    term: String.raw`(?:new\s+baby|baby\s+(?:gift|gifts|shower|clothing|products)|newborn|maternity|prenatal|mothercare|babydream|babybean|βρεφικα|βρεφικες|βρεφικο|νεογεννητ[α-ω]*|προικα\s+μωρ[α-ω]*)`,
    category: "kids-baby",
  },
] as const;

// The card text is explicit, but the merchant/title identity itself is polluted
// by an archive-page label. Keep it out until the canonical identity is repaired.
const EXCLUDED_ACTION_KEYS = new Set([
  "cmtb77cyu0029dkiy2m2zhm0b:for-kids",
]);

type ResidualAudit = {
  version: number;
  scope: "NON_ARCHIVED" | "ALL";
  planId: string;
  reviews: Array<{ cardId: string }>;
};
type Action = {
  actionId: string;
  giftCardId: string;
  occasionId: string;
  occasionSlug: string;
  relevance: number;
  ruleId: string;
  merchantName: string;
  giftCardTitle: string;
  verificationStatus: string;
  categorySlug: string;
  evidenceSnippet: string;
};
type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  residualAuditPlanId: string;
  residualAuditFingerprint: string;
  catalogFingerprint: string;
  occasionFingerprint: string;
  planId: string;
  summary: {
    totalGiftCards: number;
    activeCards: number;
    existingRelations: number;
    cardsWithExistingOccasion: number;
    residualReviewCardsSkipped: number;
    safeRelations: number;
    safeCards: number;
    newlyCoveredCards: number;
    cardsWithAnyOccasionAfterSafe: number;
    cardsWithoutOccasionAfterSafe: number;
    byOccasion: Record<string, number>;
    byVerificationStatus: Record<string, number>;
  };
  actions: Action[];
};

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function matchSnippet(text: string, term: string) {
  const pattern = new RegExp(
    `(?:${GIFT})[\\s\\S]{0,100}(?:${term})|(?:${term})[\\s\\S]{0,100}(?:${GIFT})`,
    "iu",
  );
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return null;
  return text.slice(Math.max(0, match.index - 70), Math.min(text.length, match.index + match[0].length + 70));
}

async function loadCards() {
  return prisma.giftCard.findMany({
    where: { status: "ACTIVE", merchant: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      verificationStatus: true,
      merchant: { select: { name: true } },
      categories: {
        select: { categoryId: true, primary: true, category: { select: { slug: true } } },
      },
      occasions: {
        orderBy: { occasionId: "asc" },
        select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } },
      },
    },
  });
}
type Card = Awaited<ReturnType<typeof loadCards>>[number];
function categoryFor(card: Card) {
  return card.categories.find((item) => item.primary)?.category.slug ||
    (card.categories.length === 1 ? card.categories[0].category.slug : null);
}
function fingerprint(cards: Card[]) {
  return hash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      title: card.title,
      officialUrl: card.officialUrl,
      verificationStatus: card.verificationStatus,
      categories: card.categories
        .map((item) => ({ id: item.categoryId, primary: item.primary, slug: item.category.slug }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      occasions: card.occasions.map((item) => ({
        id: item.occasionId,
        relevance: item.relevance,
        slug: item.occasion.slug,
      })),
    })),
  );
}
function countBy(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
  );
}
function material(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}
function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan;
  if (hash(material(rest)) !== plan.planId) throw new Error("Stored plan hash is invalid.");
}
function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCsv(plan: Plan, filePath: string) {
  const headers = [
    "actionId", "giftCardId", "merchantName", "giftCardTitle", "verificationStatus",
    "categorySlug", "occasionSlug", "relevance", "ruleId", "evidenceSnippet",
  ];
  const lines = [
    headers.join(","),
    ...plan.actions.map((action) =>
      headers.map((header) => csvEscape(action[header as keyof Action])).join(","),
    ),
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(): Promise<Plan> {
  const residualAudit = readJson<ResidualAudit>(RESIDUAL_AUDIT_JSON);
  if (residualAudit.version !== 11 || residualAudit.scope !== "NON_ARCHIVED" || !residualAudit.planId) {
    throw new Error("Expected the latest active-only v11 residual audit.");
  }
  const [cards, totalGiftCards, occasions] = await Promise.all([
    loadCards(),
    prisma.giftCard.count(),
    prisma.occasion.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      select: { id: true, slug: true },
    }),
  ]);
  const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const residualIds = new Set(residualAudit.reviews.map((review) => review.cardId));
  const actions: Action[] = [];
  const actionKeys = new Set<string>();
  for (const card of cards) {
    if (residualIds.has(card.id)) continue;
    const categorySlug = categoryFor(card);
    if (!categorySlug || !card.officialUrl) continue;
    const identity = normalize(`${card.merchant.name} ${card.title}`);
    const existing = new Set(card.occasions.map((item) => item.occasion.slug));
    for (const rule of RULES) {
      if (existing.has(rule.slug) || (rule.category && categorySlug !== rule.category)) continue;
      const occasionId = occasionBySlug.get(rule.slug);
      if (!occasionId) throw new Error(`Active occasion definition missing: ${rule.slug}`);
      const evidenceSnippet = matchSnippet(identity, rule.term);
      const key = `${card.id}:${rule.slug}`;
      if (!evidenceSnippet || actionKeys.has(key) || EXCLUDED_ACTION_KEYS.has(key)) continue;
      const actionBase = {
        giftCardId: card.id,
        occasionId,
        occasionSlug: rule.slug,
        relevance: 100,
        ruleId: rule.id,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        verificationStatus: card.verificationStatus,
        categorySlug,
        evidenceSnippet,
      };
      actions.push({ actionId: hash(actionBase), ...actionBase });
      actionKeys.add(key);
    }
  }
  actions.sort((a, b) => a.giftCardId.localeCompare(b.giftCardId) || a.occasionSlug.localeCompare(b.occasionSlug));
  const existingRelations = cards.reduce((sum, card) => sum + card.occasions.length, 0);
  const existingCards = new Set(cards.filter((card) => card.occasions.length).map((card) => card.id));
  const afterCards = new Set([...existingCards, ...actions.map((action) => action.giftCardId)]);
  const planBase = {
    version: VERSION,
    mode: "PREVIEW" as const,
    residualAuditPlanId: residualAudit.planId,
    residualAuditFingerprint: hash(residualAudit),
    catalogFingerprint: fingerprint(cards),
    occasionFingerprint: hash(occasions),
    summary: {
      totalGiftCards,
      activeCards: cards.length,
      existingRelations,
      cardsWithExistingOccasion: existingCards.size,
      residualReviewCardsSkipped: cards.filter((card) => residualIds.has(card.id)).length,
      safeRelations: actions.length,
      safeCards: new Set(actions.map((action) => action.giftCardId)).size,
      newlyCoveredCards: new Set(actions.filter((action) => !existingCards.has(action.giftCardId)).map((action) => action.giftCardId)).size,
      cardsWithAnyOccasionAfterSafe: afterCards.size,
      cardsWithoutOccasionAfterSafe: cards.length - afterCards.size,
      byOccasion: countBy(actions.map((action) => action.occasionSlug)),
      byVerificationStatus: countBy(actions.map((action) => action.verificationStatus)),
    },
    actions,
  };
  return { ...planBase, generatedAt: new Date().toISOString(), planId: hash(material(planBase)) };
}

function readStoredPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Apply/post-audit requires the exact --plan-id from preview.");
  }
  return plan;
}
async function stats() {
  const [totalGiftCards, activeCards, occasionRelations, cardsWithOccasion] = await Promise.all([
    prisma.giftCard.count(),
    prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } } }),
    prisma.giftCardOccasion.count(),
    prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" }, occasions: { some: {} } } }),
  ]);
  return { totalGiftCards, activeCards, occasionRelations, cardsWithOccasion };
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  writeCsv(plan, PLAN_CSV);
  fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  console.log("Dorokartes Catalog Recipient Mapping v4 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Catalog: ${plan.summary.activeCards} active / ${plan.summary.totalGiftCards} total`);
  console.log(`Safe: ${plan.summary.safeRelations} relations across ${plan.summary.safeCards} cards`);
  console.log(`Newly covered cards: ${plan.summary.newlyCoveredCards}`);
  console.log(`After apply: ${plan.summary.cardsWithAnyOccasionAfterSafe} covered / ${plan.summary.cardsWithoutOccasionAfterSafe} without occasion`);
  console.log(`Skipped residual-review cards: ${plan.summary.residualReviewCardsSkipped}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function applyPlan() {
  const plan = readStoredPlan();
  const residualAudit = readJson<ResidualAudit>(RESIDUAL_AUDIT_JSON);
  const cards = await loadCards();
  const occasions = await prisma.occasion.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, slug: true } });
  if (hash(residualAudit) !== plan.residualAuditFingerprint || residualAudit.planId !== plan.residualAuditPlanId) throw new Error("Residual audit changed after preview.");
  if (fingerprint(cards) !== plan.catalogFingerprint || hash(occasions) !== plan.occasionFingerprint) throw new Error("Catalog or taxonomy changed after preview.");
  const before = await stats();
  if (before.totalGiftCards !== plan.summary.totalGiftCards || before.activeCards !== plan.summary.activeCards || before.occasionRelations !== plan.summary.existingRelations) throw new Error("Database counts changed after preview.");
  await prisma.$transaction(async (tx) => {
    const result = await tx.giftCardOccasion.createMany({ data: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId, relevance: action.relevance })) });
    if (result.count !== plan.actions.length) throw new Error("Apply count mismatch.");
  }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 });
  const after = await stats();
  if (after.totalGiftCards !== before.totalGiftCards || after.activeCards !== before.activeCards || after.occasionRelations !== before.occasionRelations + plan.actions.length) throw new Error("Post-apply cardinality invariant failed.");
  const report = { version: VERSION, mode: "APPLY", appliedAt: new Date().toISOString(), planId: plan.planId, applied: plan.actions.length, before, after };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`APPLY ${plan.actions.length}: relations ${before.occasionRelations} -> ${after.occasionRelations}; gift cards ${before.totalGiftCards} -> ${after.totalGiftCards}`);
}

async function postAudit() {
  const plan = readStoredPlan();
  const applyReport = readJson<{ planId: string; applied: number; before: Awaited<ReturnType<typeof stats>>; after: Awaited<ReturnType<typeof stats>> }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) throw new Error("Apply report mismatch.");
  const relations = await prisma.giftCardOccasion.findMany({ where: { OR: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId })) }, select: { giftCardId: true, occasionId: true, relevance: true } });
  const failed = plan.actions.filter((action) => !relations.some((item) => item.giftCardId === action.giftCardId && item.occasionId === action.occasionId && item.relevance === action.relevance));
  const current = await stats();
  const invariants = { totalGiftCardsPreserved: current.totalGiftCards === applyReport.before.totalGiftCards, activeCardsPreserved: current.activeCards === applyReport.before.activeCards, relationCountMatches: current.occasionRelations === applyReport.after.occasionRelations };
  const report = { version: VERSION, mode: "POST_AUDIT", generatedAt: new Date().toISOString(), planId: plan.planId, checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action) => action.actionId), current, invariants, databaseWrites: 0 };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`);
  if (failed.length || Object.values(invariants).some((value) => !value)) throw new Error("Post-audit failed.");
  console.log(`POST-AUDIT ${report.passed}/${report.checked}; gift cards preserved: ${current.totalGiftCards}`);
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) await applyPlan();
  else if (POST_AUDIT) await postAudit();
  else await preview();
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
