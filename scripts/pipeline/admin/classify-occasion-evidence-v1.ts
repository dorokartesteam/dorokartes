import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "occasion-evidence-v1";
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="))?.split("=")[1];

const EXPLICIT_PATTERNS = [
  { slug: "birthday", pattern: /\b(?:birthday|γενεθλ\w*)\b/i },
  { slug: "name-day", pattern: /\b(?:name day|nameday|ονομαστικ\w*)\b/i },
  { slug: "wedding", pattern: /\b(?:wedding|γαμ(?:ος|ου|ο))\b/i },
  { slug: "anniversary", pattern: /\b(?:anniversary|επετει\w*)\b/i },
  { slug: "new-baby", pattern: /\b(?:new baby|baby shower|νεογεννη\w*|γεννηση μωρ\w*)\b/i },
  { slug: "christening", pattern: /\b(?:christening|baptism|βαπτισ\w*)\b/i },
  { slug: "graduation", pattern: /\b(?:graduat\w*|αποφοιτ\w*)\b/i },
  { slug: "christmas", pattern: /\b(?:christmas|xmas|χριστουγεν\w*)\b/i },
  { slug: "easter", pattern: /\b(?:easter|πασχ\w*)\b/i },
  { slug: "valentines", pattern: /\b(?:valentin\w*|βαλεντιν\w*)\b/i },
  { slug: "mothers-day", pattern: /\b(?:mother s day|mothers day|γ\s*μητερ\w*|μητερ\w*)\b/i },
  { slug: "fathers-day", pattern: /\b(?:father s day|fathers day|πατερ\w*)\b/i },
  { slug: "thank-you", pattern: /\b(?:thank you|thanks|ευχαριστ\w*)\b/i },
  { slug: "retirement", pattern: /\b(?:retirement|συνταξιοδοτ\w*)\b/i },
  { slug: "for-her", pattern: /\b(?:for her|για εκεινη)\b/i },
  { slug: "for-him", pattern: /\b(?:for him|για εκεινον)\b/i },
  { slug: "for-kids", pattern: /\b(?:for kids|for children|για παιδ\w*)\b/i },
] as const;

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/|?&=+.-]+/g, " ")
    .replace(/[^a-z0-9α-ω\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function immutableReportPath(filePath: string, hash: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${hash.slice(0, 16)}${parsed.ext}`);
}

async function loadCards() {
  return prisma.giftCard.findMany({
    where: { status: "ACTIVE", merchant: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      corporateAvailable: true,
      merchant: { select: { id: true, name: true } },
      variants: { where: { active: true }, select: { type: true } },
      occasions: { orderBy: { occasionId: "asc" }, select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } } },
    },
  });
}

type CatalogCard = Awaited<ReturnType<typeof loadCards>>[number];

function fingerprintRows(cards: CatalogCard[]) {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    slug: card.slug,
    officialUrl: card.officialUrl,
    corporateAvailable: card.corporateAvailable,
    merchantId: card.merchant.id,
    variants: card.variants.map((variant) => variant.type).sort(),
    occasions: card.occasions.map((occasion) => ({ slug: occasion.occasion.slug, relevance: occasion.relevance })),
  }));
}

async function catalogFingerprint() {
  return stableHash(fingerprintRows(await loadCards()));
}

function evidenceMatches(card: CatalogCard) {
  const titleText = normalize(`${card.title} ${card.slug}`);
  let urlText = "";
  try {
    const url = card.officialUrl ? new URL(card.officialUrl) : null;
    urlText = normalize(url ? `${url.pathname} ${url.search}` : "");
  } catch {
    urlText = "";
  }
  const matches: Array<{ occasionSlug: string; relevance: number; evidence: string }> = [];
  for (const rule of EXPLICIT_PATTERNS) {
    if (rule.pattern.test(titleText)) matches.push({ occasionSlug: rule.slug, relevance: 100, evidence: "EXPLICIT_CARD_TITLE_OR_SLUG" });
    else if (rule.pattern.test(urlText)) matches.push({ occasionSlug: rule.slug, relevance: 90, evidence: "EXPLICIT_OFFICIAL_URL_PATH" });
  }
  if (card.corporateAvailable || card.variants.some((variant) => variant.type === "CORPORATE")) {
    matches.push({ occasionSlug: "corporate", relevance: 100, evidence: "STRUCTURED_CORPORATE_AVAILABILITY" });
  }
  return matches;
}

async function buildPlan() {
  const cards = await loadCards();
  const availableOccasions = await prisma.occasion.findMany({ where: { active: true }, select: { id: true, slug: true } });
  const occasionBySlug = new Map(availableOccasions.map((occasion) => [occasion.slug, occasion.id]));
  const actions = [];
  const reviews = [];

  for (const card of cards) {
    const existing = new Set(card.occasions.map((relation) => relation.occasion.slug));
    for (const match of evidenceMatches(card)) {
      if (existing.has(match.occasionSlug)) continue;
      const occasionId = occasionBySlug.get(match.occasionSlug);
      const common = {
        giftCardId: card.id,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        officialUrl: card.officialUrl,
        occasionSlug: match.occasionSlug,
        relevance: match.relevance,
        evidence: match.evidence,
      };
      if (!occasionId) {
        reviews.push({ ...common, reason: "OCCASION_DEFINITION_MISSING_OR_INACTIVE" });
        continue;
      }
      const action = { ...common, occasionId };
      actions.push({ ...action, actionId: stableHash(action) });
    }
  }

  const planWithoutId = {
    version: VERSION,
    mode: "PREVIEW" as const,
    generatedAt: new Date().toISOString(),
    catalogFingerprint: stableHash(fingerprintRows(cards)),
    summary: {
      activeCards: cards.length,
      actions: actions.length,
      cardsCovered: new Set(actions.map((action) => action.giftCardId)).size,
      byOccasion: Object.fromEntries([...new Set(actions.map((action) => action.occasionSlug))].sort().map((slug) => [slug, actions.filter((action) => action.occasionSlug === slug).length])),
      reviews: reviews.length,
    },
    actions,
    reviews,
  };
  return { ...planWithoutId, planId: stableHash(planWithoutId) };
}

function readPlan() {
  if (!PLAN_ID_ARG) throw new Error("Missing --plan-id=<id>.");
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (plan.version !== VERSION) throw new Error(`Unsupported plan version: ${plan.version}`);
  if (plan.planId !== PLAN_ID_ARG) throw new Error("Plan ID does not match the saved preview.");
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  const rows = [
    ["status", "giftCardId", "merchantName", "giftCardTitle", "occasionSlug", "relevance", "evidence", "officialUrl", "reason", "actionId"],
    ...plan.actions.map((action) => ["SAFE", action.giftCardId, action.merchantName, action.giftCardTitle, action.occasionSlug, action.relevance, action.evidence, action.officialUrl, "", action.actionId]),
    ...plan.reviews.map((review) => ["REVIEW", review.giftCardId, review.merchantName, review.giftCardTitle, review.occasionSlug, review.relevance, review.evidence, review.officialUrl, review.reason, ""]),
  ];
  fs.writeFileSync(PLAN_CSV, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  fs.copyFileSync(PLAN_JSON, immutableReportPath(PLAN_JSON, plan.planId));
  fs.copyFileSync(PLAN_CSV, immutableReportPath(PLAN_CSV, plan.planId));
  console.log("Dorokartes Occasion Evidence v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Active cards: ${plan.summary.activeCards}`);
  console.log(`Safe relations: ${plan.summary.actions}`);
  console.log(`Cards covered: ${plan.summary.cardsCovered}`);
  console.log(`Reviews: ${plan.summary.reviews}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function apply() {
  const plan = readPlan();
  if (await catalogFingerprint() !== plan.catalogFingerprint) {
    throw new Error("Catalog/occasion state changed after preview. Generate and inspect a new plan.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.giftCardOccasion.createMany({
      data: plan.actions.map((action: { giftCardId: string; occasionId: string; relevance: number }) => ({
        giftCardId: action.giftCardId,
        occasionId: action.occasionId,
        relevance: action.relevance,
      })),
    });
  }, { maxWait: 15_000, timeout: 60_000 });
  const report = { version: VERSION, mode: "APPLY", planId: plan.planId, appliedAt: new Date().toISOString(), applied: plan.actions.length };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(APPLY_JSON, immutableReportPath(APPLY_JSON, stableHash(report)));
  console.log("Dorokartes Occasion Evidence v1 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${report.applied}`);
}

async function postAudit() {
  const plan = readPlan();
  if (!fs.existsSync(APPLY_JSON)) throw new Error(`Missing successful apply report: ${APPLY_JSON}`);
  const applyReport = JSON.parse(fs.readFileSync(APPLY_JSON, "utf8"));
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Successful apply report does not match the requested preview plan.");
  }
  const relations = await prisma.giftCardOccasion.findMany({
    where: { giftCardId: { in: plan.actions.map((action: { giftCardId: string }) => action.giftCardId) } },
    select: { giftCardId: true, occasionId: true, relevance: true },
  });
  const failed = plan.actions.filter((action: { giftCardId: string; occasionId: string; relevance: number }) => !relations.some((relation) => relation.giftCardId === action.giftCardId && relation.occasionId === action.occasionId && relation.relevance === action.relevance));
  const report = { version: VERSION, mode: "POST_AUDIT", planId: plan.planId, auditedAt: new Date().toISOString(), checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action: { actionId: string }) => action.actionId) };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(POST_AUDIT_JSON, immutableReportPath(POST_AUDIT_JSON, stableHash(report)));
  console.log("Dorokartes Occasion Evidence v1 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  try {
    if (APPLY) await apply();
    else if (POST_AUDIT) await postAudit();
    else await preview();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
