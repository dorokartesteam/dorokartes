import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "recipient-review-approvals-v6" as const;
const SOURCE_VERSION = "catalog-recipient-evidence-v5";
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv.find((value) => value.startsWith("--plan-id="))?.slice(10);
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_JSON = path.join(REPORT_DIR, `${SOURCE_VERSION}-plan.json`);
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

// Every key below was reviewed against its retained official-page snippet.
const APPROVED_KEYS = new Set([
  "cmt79igbu001084iy7fkqj7p6:for-her",
  "cmt79igbu001084iy7fkqj7p6:for-him",
  "cmta1f1n7000tq8iylhz55ztt:for-kids",
  "cmta1f1n7000tq8iylhz55ztt:new-baby",
  "cmta1f5j70017q8iy3ul3t87x:for-kids",
  "cmta1f5j70017q8iy3ul3t87x:new-baby",
  "cmta1faxg001vq8iy39nw940w:for-him",
  "cmta1fza40049q8iyylawabqi:for-him",
  "cmta1g1hr004dq8iyf2v0rt9r:for-her",
  "cmta1g1hr004dq8iyf2v0rt9r:for-him",
  "cmta1gdar005eq8iym6dznhq7:for-her",
  "cmta1gdar005eq8iym6dznhq7:for-him",
  "cmta1gkq30066q8iy4xwfkmos:for-her",
  "cmta1gzev007oq8iyr3kfe0e4:for-him",
  "cmta1hdl9008mq8iy0bgrltgd:for-her",
  "cmta1hdl9008mq8iy0bgrltgd:for-him",
  "cmta1hpnc009wq8iyllivlokf:for-kids",
  "cmta1hq38009yq8iyiiaeil9q:for-him",
  "cmta1ib7s00c0q8iydisho748:for-her",
  "cmta1ib7s00c0q8iydisho748:for-him",
  "cmta1ih5a00coq8iy028nylzo:for-her",
  "cmta1ih5a00coq8iy028nylzo:for-him",
  "cmta1iy0a00ewq8iyav1zn7nb:for-her",
  "cmta1iy0a00ewq8iyav1zn7nb:for-him",
  "cmta1j5sk00fsq8iyl71inf5f:for-her",
  "cmta1j5sk00fsq8iyl71inf5f:for-him",
  "cmta1jaht00gcq8iyymttuqej:new-baby",
  "cmta1jtpy00iiq8iy3wykjo58:for-him",
  "cmta1k7qi00k6q8iytw0avvi7:for-him",
  "cmta1ke9500kwq8iyhmopp6q4:new-baby",
  "cmta1krb300meq8iyewvehlr3:for-her",
  "cmta1krb300meq8iyewvehlr3:for-him",
  "cmta1kvpg00mwq8iywg5mlfel:for-her",
  "cmta1kvpg00mwq8iywg5mlfel:for-him",
  "cmta1kz5j00naq8iyo9j5whw7:for-her",
  "cmta1kz5j00naq8iyo9j5whw7:for-him",
  "cmta1lzvj00raq8iye3ba3495:for-kids",
  "cmta1ma4m00seq8iy71vkx6rw:for-him",
  "cmta1mseo00uaq8iyrfav970x:for-him",
  "cmta1mtcc00ueq8iy4sz85qxi:for-her",
  "cmta1mtcc00ueq8iy4sz85qxi:for-him",
  "cmta1nygv00ywq8iyut96fn9h:for-her",
  "cmta4y9db000bsciyg566bd57:for-him",
  "cmta4ymbf001rsciyxe7d8lyq:for-kids",
  "cmta4yr0v002bsciy3uqdyifr:for-her",
  "cmta4z5vh0041sciye1uhquaq:for-her",
  "cmta5nr07001154iydfgb6an6:for-her",
  "cmta5nr07001154iydfgb6an6:for-him",
  "cmta5nwz8001x54iybk0fzt5z:for-her",
  "cmtb62hqq000f94iyv9s6defo:new-baby",
  "cmtb62m9i001394iyhpjrq5xk:for-her",
  "cmtb62m9i001394iyhpjrq5xk:for-him",
  "cmtb6uijf000p3giy2w2ofsxh:for-her",
  "cmtb6uijf000p3giy2w2ofsxh:for-him",
  "cmtb6uux3002i3giypec585z9:for-her",
  "cmtb6uyyo00343giydgpq1m37:for-him",
  "cmtb6v334003q3giysxf9hqnj:for-him",
  "cmtb77h85002vdkiyrade1jng:for-her",
  "cmtb77kk9003ddkiyhamgukvo:for-her",
  "cmtb77mdy003mdkiy52m5hkpz:for-kids",
  "cmtb77mdy003mdkiy52m5hkpz:new-baby",
  "cmtb77ni3003sdkiyl9m6uyo5:for-kids",
  "cmtb78f6y007mdkiyuykz63vg:new-baby",
]);
const REJECTED_KEYS = new Map([
  ["cmtb77j2x0035dkiyogo2a953:new-baby", "POLLUTED_ARCHIVE_IDENTITY_REQUIRES_CANONICAL_REPAIR"],
]);

type Review = { giftCardId: string; merchantName: string; giftCardTitle: string; verificationStatus: string; categorySlug: string; officialUrl: string; occasionSlug: string; relevance: number; ruleId: string; evidenceSurface: string; evidenceSnippet: string; reason: string };
type SourcePlan = { version: string; mode: string; generatedAt: string; planId: string; reviews: Review[]; [key: string]: unknown };
type Action = Review & { actionId: string; occasionId: string; decision: "MANUAL_REVIEW_APPROVED" };
type Rejection = Review & { decision: "MANUAL_REVIEW_REJECTED"; decisionReason: string };
type Plan = { version: typeof VERSION; mode: "PREVIEW"; generatedAt: string; sourcePlanId: string; sourcePlanFingerprint: string; catalogFingerprint: string; occasionFingerprint: string; planId: string; summary: { totalGiftCards: number; activeCards: number; existingRelations: number; approvedRelations: number; approvedCards: number; rejectedRelations: number; newlyCoveredCards: number; byOccasion: Record<string, number>; byEvidenceSurface: Record<string, number> }; actions: Action[]; rejections: Rejection[] };

function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function readJson<T>(filePath: string): T { if (!fs.existsSync(filePath)) throw new Error(`Missing required input: ${filePath}`); return JSON.parse(fs.readFileSync(filePath, "utf8")) as T; }
function verifyHashedPlan(plan: { generatedAt: string; planId: string; [key: string]: unknown }) { const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan; if (hash(rest) !== plan.planId) throw new Error("Plan hash is invalid."); }
function countBy(values: string[]) { return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length])); }
function csvEscape(value: unknown) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

async function loadCards() {
  return prisma.giftCard.findMany({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } }, orderBy: { id: "asc" }, select: { id: true, merchantId: true, title: true, officialUrl: true, verificationStatus: true, merchant: { select: { name: true } }, categories: { select: { categoryId: true, primary: true, category: { select: { slug: true } } } }, occasions: { orderBy: { occasionId: "asc" }, select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } } } } });
}
type Card = Awaited<ReturnType<typeof loadCards>>[number];
function categoryFor(card: Card) { return card.categories.find((item) => item.primary)?.category.slug || (card.categories.length === 1 ? card.categories[0].category.slug : null); }
function fingerprint(cards: Card[]) { return hash(cards.map((card) => ({ id: card.id, merchantId: card.merchantId, merchantName: card.merchant.name, title: card.title, officialUrl: card.officialUrl, verificationStatus: card.verificationStatus, categories: card.categories.map((item) => ({ id: item.categoryId, primary: item.primary, slug: item.category.slug })).sort((a, b) => a.id.localeCompare(b.id)), occasions: card.occasions.map((item) => ({ id: item.occasionId, relevance: item.relevance, slug: item.occasion.slug })) }))); }
function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) { return plan; }
function verifyPlan(plan: Plan) { const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan; if (hash(planMaterial(rest)) !== plan.planId) throw new Error("Stored approval plan hash is invalid."); }
function writeCsv(plan: Plan) { const headers = ["status", "giftCardId", "merchantName", "giftCardTitle", "verificationStatus", "categorySlug", "occasionSlug", "relevance", "evidenceSurface", "evidenceSnippet", "decisionReason", "actionId"]; const rows = [...plan.actions.map((action) => ({ status: "APPROVED", decisionReason: "", ...action })), ...plan.rejections.map((rejection) => ({ status: "REJECTED", actionId: "", ...rejection }))]; fs.writeFileSync(PLAN_CSV, `\uFEFF${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape((row as unknown as Record<string, unknown>)[header])).join(","))].join("\n")}\n`, "utf8"); }

async function buildPlan(): Promise<Plan> {
  const source = readJson<SourcePlan>(SOURCE_JSON); verifyHashedPlan(source);
  if (source.version !== SOURCE_VERSION || source.mode !== "PREVIEW") throw new Error("Unexpected v5 source plan.");
  const sourceByKey = new Map(source.reviews.map((review) => [`${review.giftCardId}:${review.occasionSlug}`, review]));
  const ledgerKeys = new Set([...APPROVED_KEYS, ...REJECTED_KEYS.keys()]);
  const unclassified = [...sourceByKey.keys()].filter((key) => !ledgerKeys.has(key));
  const unknown = [...ledgerKeys].filter((key) => !sourceByKey.has(key));
  if (unclassified.length || unknown.length || ledgerKeys.size !== source.reviews.length) throw new Error(`Decision ledger mismatch: ${unclassified.length} unclassified, ${unknown.length} unknown.`);
  const [cards, totalGiftCards, occasions] = await Promise.all([loadCards(), prisma.giftCard.count(), prisma.occasion.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, slug: true } })]);
  const cardById = new Map(cards.map((card) => [card.id, card])); const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const actions: Action[] = [];
  for (const key of APPROVED_KEYS) {
    const review = sourceByKey.get(key)!; const card = cardById.get(review.giftCardId); const occasionId = occasionBySlug.get(review.occasionSlug);
    if (!card || !occasionId || card.title !== review.giftCardTitle || card.merchant.name !== review.merchantName || card.officialUrl !== review.officialUrl || card.verificationStatus !== review.verificationStatus || categoryFor(card) !== review.categorySlug || card.occasions.some((item) => item.occasion.slug === review.occasionSlug)) throw new Error(`Approval precondition failed: ${key}`);
    const base = { ...review, occasionId, decision: "MANUAL_REVIEW_APPROVED" as const }; actions.push({ actionId: hash(base), ...base });
  }
  const rejections = [...REJECTED_KEYS].map(([key, decisionReason]): Rejection => ({ ...sourceByKey.get(key)!, decision: "MANUAL_REVIEW_REJECTED", decisionReason }));
  actions.sort((a, b) => a.giftCardId.localeCompare(b.giftCardId) || a.occasionSlug.localeCompare(b.occasionSlug));
  const existingRelations = cards.reduce((sum, card) => sum + card.occasions.length, 0); const covered = new Set(cards.filter((card) => card.occasions.length).map((card) => card.id));
  const base = { version: VERSION, mode: "PREVIEW" as const, sourcePlanId: source.planId, sourcePlanFingerprint: hash(source), catalogFingerprint: fingerprint(cards), occasionFingerprint: hash(occasions), summary: { totalGiftCards, activeCards: cards.length, existingRelations, approvedRelations: actions.length, approvedCards: new Set(actions.map((action) => action.giftCardId)).size, rejectedRelations: rejections.length, newlyCoveredCards: new Set(actions.filter((action) => !covered.has(action.giftCardId)).map((action) => action.giftCardId)).size, byOccasion: countBy(actions.map((action) => action.occasionSlug)), byEvidenceSurface: countBy(actions.map((action) => action.evidenceSurface)) }, actions, rejections };
  return { ...base, generatedAt: new Date().toISOString(), planId: hash(planMaterial(base)) };
}

function readStoredPlan() { const plan = readJson<Plan>(PLAN_JSON); verifyPlan(plan); if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) throw new Error("Apply/post-audit requires the exact --plan-id from preview."); return plan; }
async function stats() { const [giftCards, activeCards, relations, coveredCards] = await Promise.all([prisma.giftCard.count(), prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } } }), prisma.giftCardOccasion.count(), prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" }, occasions: { some: {} } } })]); return { giftCards, activeCards, relations, coveredCards }; }

async function preview() { const plan = await buildPlan(); fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8"); writeCsv(plan); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(plan, null, 2)}\n`, "utf8"); console.log("Dorokartes Recipient Review Approvals v6 — PREVIEW"); console.log(`Plan ID: ${plan.planId}`); console.log(`Approved: ${plan.summary.approvedRelations} relations across ${plan.summary.approvedCards} cards (${plan.summary.newlyCoveredCards} newly covered)`); console.log(`Rejected: ${plan.summary.rejectedRelations}`); console.log("PREVIEW ONLY — no database rows changed."); }

async function applyPlan() {
  const plan = readStoredPlan(); const source = readJson<SourcePlan>(SOURCE_JSON); verifyHashedPlan(source); const cards = await loadCards(); const occasions = await prisma.occasion.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, slug: true } });
  if (source.planId !== plan.sourcePlanId || hash(source) !== plan.sourcePlanFingerprint || fingerprint(cards) !== plan.catalogFingerprint || hash(occasions) !== plan.occasionFingerprint) throw new Error("Source, catalog, or taxonomy changed after preview.");
  const before = await stats(); if (before.giftCards !== plan.summary.totalGiftCards || before.activeCards !== plan.summary.activeCards || before.relations !== plan.summary.existingRelations) throw new Error("Database counts changed after preview.");
  await prisma.$transaction(async (tx) => { const result = await tx.giftCardOccasion.createMany({ data: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId, relevance: action.relevance })) }); if (result.count !== plan.actions.length) throw new Error("Apply count mismatch."); }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 });
  const after = await stats(); if (after.giftCards !== before.giftCards || after.activeCards !== before.activeCards || after.relations !== before.relations + plan.actions.length) throw new Error("Post-apply invariant failed.");
  const report = { version: VERSION, mode: "APPLY", appliedAt: new Date().toISOString(), planId: plan.planId, applied: plan.actions.length, before, after }; fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8"); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(`APPLY ${report.applied}: relations ${before.relations} -> ${after.relations}; gift cards ${before.giftCards} -> ${after.giftCards}`);
}

async function postAudit() { const plan = readStoredPlan(); const applyReport = readJson<{ planId: string; applied: number; before: Awaited<ReturnType<typeof stats>>; after: Awaited<ReturnType<typeof stats>> }>(APPLY_JSON); if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) throw new Error("Apply report mismatch."); const rows = await prisma.giftCardOccasion.findMany({ where: { OR: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId })) }, select: { giftCardId: true, occasionId: true, relevance: true } }); const failed = plan.actions.filter((action) => !rows.some((row) => row.giftCardId === action.giftCardId && row.occasionId === action.occasionId && row.relevance === action.relevance)); const current = await stats(); const invariants = { giftCardsPreserved: current.giftCards === applyReport.before.giftCards, activeCardsPreserved: current.activeCards === applyReport.before.activeCards, relationCountMatches: current.relations === applyReport.after.relations }; const report = { version: VERSION, mode: "POST_AUDIT", generatedAt: new Date().toISOString(), planId: plan.planId, checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action) => action.actionId), current, invariants, databaseWrites: 0 }; fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8"); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"); if (failed.length || Object.values(invariants).some((value) => !value)) throw new Error("Post-audit failed."); console.log(`POST-AUDIT ${report.passed}/${report.checked}; gift cards preserved: ${current.giftCards}`); }

async function main() { if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined."); if (APPLY) await applyPlan(); else if (POST_AUDIT) await postAudit(); else await preview(); }
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
