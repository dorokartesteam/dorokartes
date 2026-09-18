import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "catalog-recipient-evidence-v5" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv.find((value) => value.startsWith("--plan-id="))?.slice(10);
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_JSON = path.join(REPORT_DIR, "taxonomy-evidence-v2.json");
const AUDIT_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-active-post-audit.json");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const GIFT = String.raw`(?:gift\s*(?:card|cards|voucher|vouchers|certificate|certificates)|e\s*gift\s*card|voucher|dorokart[\w]*|dwrokart[\w]*|doroepitag[\w]*|δωροκαρτ[α-ω]*|δωροεπιταγ[α-ω]*)`;
const RULES = [
  { id: "official-for-her-explicit-v1", slug: "for-her", term: String.raw`(?:for\s+(?:her|women)|for\s+(?:every\s+)?(?:stylish\s+)?woman|για\s+(?:γυναικα|γυναικες|εκεινη)|γυναικεια|γυναικειο|γυναικειες)`, category: null },
  { id: "official-for-him-explicit-v1", slug: "for-him", term: String.raw`(?:for\s+(?:him|men)|for\s+(?:every\s+)?man|για\s+(?:ανδρα|ανδρες|εκεινον)|ανδρικα|ανδρικη|ανδρικο)`, category: null },
  { id: "official-for-kids-explicit-v1", slug: "for-kids", term: String.raw`(?:for\s+(?:kids|children)|ideas\s+for\s+kids|kids?\s+(?:fashion|clothing|wear)|για\s+παιδ[α-ω]*|παιδικα|παιδικες|παιδικο|παιδια|παιδι)`, category: "kids-baby" },
  { id: "official-new-baby-explicit-v1", slug: "new-baby", term: String.raw`(?:new\s+baby|baby\s+(?:gift|gifts|shower|clothing|products)|newborn|maternity|prenatal|mothercare|babydream|babybean|βρεφικα|βρεφικες|βρεφικο|νεογεννητ[α-ω]*|προικα\s+μωρ[α-ω]*)`, category: "kids-baby" },
] as const;
const EXCLUDED_KEYS = new Set(["cmtb77cyu0029dkiy2m2zhm0b:for-kids"]);

type PageEvidence = { requestedUrl: string; finalUrl: string | null; ok: boolean; title: string | null; description: string | null; headings: string[]; navigation: string[]; excerpt: string | null };
type SourceReport = { version: string; mode: string; cardCount: number; reportId: string; rows: Array<{ giftCardId: string; merchantId: string; merchantName: string; giftCardTitle: string; officialUrl: string | null; officialEvidence: PageEvidence }> };
type ResidualAudit = { version: number; scope: "NON_ARCHIVED" | "ALL"; planId: string; reviews: Array<{ cardId: string }> };
type Surface = "OFFICIAL_TITLE" | "OFFICIAL_META_DESCRIPTION" | "OFFICIAL_HEADING" | "OFFICIAL_BODY_PROXIMITY" | "OFFICIAL_NAVIGATION_PROXIMITY";
type Candidate = { giftCardId: string; merchantName: string; giftCardTitle: string; verificationStatus: string; categorySlug: string; officialUrl: string; occasionSlug: string; relevance: number; ruleId: string; evidenceSurface: Surface; evidenceSnippet: string };
type Action = Candidate & { actionId: string; occasionId: string };
type Review = Candidate & { reason: "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW" | "NAVIGATION_CONTEXT_REQUIRES_MANUAL_REVIEW" };
type Plan = { version: typeof VERSION; mode: "PREVIEW"; generatedAt: string; sourceReportId: string; residualAuditPlanId: string; sourceFingerprint: string; residualAuditFingerprint: string; catalogFingerprint: string; occasionFingerprint: string; planId: string; summary: { totalGiftCards: number; activeCards: number; existingRelations: number; cardsWithExistingOccasion: number; sourceRowsMatched: number; sourceRowsStaleOrUnavailable: number; residualReviewCardsSkipped: number; safeRelations: number; safeCards: number; newlyCoveredCards: number; reviewRelations: number; reviewCards: number; byOccasion: Record<string, number>; bySurface: Record<string, number>; byVerificationStatus: Record<string, number> }; actions: Action[]; reviews: Review[] };

function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function readJson<T>(filePath: string): T { if (!fs.existsSync(filePath)) throw new Error(`Missing required input: ${filePath}`); return JSON.parse(fs.readFileSync(filePath, "utf8")) as T; }
function normalize(value?: string | null) { return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9α-ω\s]+/gi, " ").replace(/\s+/g, " ").trim(); }
function canonicalUrl(value?: string | null) { if (!value) return null; try { const url = new URL(value); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(?:utm_.+|gclid|fbclid|msclkid|srsltid)$/i.test(key)) url.searchParams.delete(key); url.hostname = url.hostname.toLowerCase().replace(/^www\./, ""); url.pathname = url.pathname.replace(/\/+$/, "") || "/"; return url.toString(); } catch { return null; } }
function snippet(text: string, term: string, distance: number) { const pattern = new RegExp(`(?:${GIFT})[\\s\\S]{0,${distance}}(?:${term})|(?:${term})[\\s\\S]{0,${distance}}(?:${GIFT})`, "iu"); const match = pattern.exec(text); if (!match || match.index === undefined) return null; return text.slice(Math.max(0, match.index - 80), Math.min(text.length, match.index + match[0].length + 80)); }
function countBy(values: string[]) { return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length])); }
function csvEscape(value: unknown) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

async function loadCards() {
  return prisma.giftCard.findMany({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } }, orderBy: { id: "asc" }, select: { id: true, merchantId: true, title: true, officialUrl: true, verificationStatus: true, merchant: { select: { name: true } }, categories: { select: { categoryId: true, primary: true, category: { select: { slug: true } } } }, occasions: { orderBy: { occasionId: "asc" }, select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } } } } });
}
type Card = Awaited<ReturnType<typeof loadCards>>[number];
function categoryFor(card: Card) { return card.categories.find((item) => item.primary)?.category.slug || (card.categories.length === 1 ? card.categories[0].category.slug : null); }
function catalogFingerprint(cards: Card[]) { return hash(cards.map((card) => ({ id: card.id, merchantId: card.merchantId, title: card.title, officialUrl: card.officialUrl, verificationStatus: card.verificationStatus, merchantName: card.merchant.name, categories: card.categories.map((item) => ({ id: item.categoryId, primary: item.primary, slug: item.category.slug })).sort((a, b) => a.id.localeCompare(b.id)), occasions: card.occasions.map((item) => ({ id: item.occasionId, relevance: item.relevance, slug: item.occasion.slug })) }))); }
function material(plan: Omit<Plan, "generatedAt" | "planId">) { return plan; }
function verifyPlan(plan: Plan) { const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan; if (hash(material(rest)) !== plan.planId) throw new Error("Stored plan hash is invalid."); }
function choose(map: Map<string, Candidate>, candidate: Candidate) { const key = `${candidate.giftCardId}:${candidate.occasionSlug}`; const current = map.get(key); if (!current || candidate.relevance > current.relevance) map.set(key, candidate); }
function makeCandidate(card: Card, rule: (typeof RULES)[number], surface: Surface, text: string | null | undefined, distance: number, relevance: number): Candidate | null { const categorySlug = categoryFor(card); if (!categorySlug || !card.officialUrl || (rule.category && categorySlug !== rule.category)) return null; const evidenceSnippet = snippet(normalize(text), rule.term, distance); if (!evidenceSnippet) return null; return { giftCardId: card.id, merchantName: card.merchant.name, giftCardTitle: card.title, verificationStatus: card.verificationStatus, categorySlug, officialUrl: card.officialUrl, occasionSlug: rule.slug, relevance, ruleId: `${rule.id}:${surface.toLowerCase()}`, evidenceSurface: surface, evidenceSnippet }; }
function writeCsv(plan: Plan, filePath: string) { const headers = ["status", "giftCardId", "merchantName", "giftCardTitle", "verificationStatus", "categorySlug", "occasionSlug", "relevance", "ruleId", "evidenceSurface", "evidenceSnippet", "officialUrl", "reason", "actionId"]; const rows = [...plan.actions.map((action) => ({ status: "SAFE", reason: "", ...action })), ...plan.reviews.map((review) => ({ status: "REVIEW", actionId: "", ...review }))]; fs.writeFileSync(filePath, `\uFEFF${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape((row as unknown as Record<string, unknown>)[header])).join(","))].join("\n")}\n`, "utf8"); }

async function buildPlan(): Promise<Plan> {
  const source = readJson<SourceReport>(SOURCE_JSON);
  const audit = readJson<ResidualAudit>(AUDIT_JSON);
  if (source.version !== "taxonomy-evidence-v2" || source.mode !== "EVIDENCE_ONLY" || source.cardCount !== source.rows.length || !source.reportId) throw new Error("Unexpected official evidence report.");
  if (audit.version !== 11 || audit.scope !== "NON_ARCHIVED" || !audit.planId) throw new Error("Expected active-only v11 residual audit.");
  const [cards, totalGiftCards, occasions] = await Promise.all([loadCards(), prisma.giftCard.count(), prisma.occasion.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, slug: true } })]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const residualIds = new Set(audit.reviews.map((review) => review.cardId));
  const safe = new Map<string, Candidate>();
  const review = new Map<string, Candidate>();
  let sourceRowsMatched = 0;
  let sourceRowsStaleOrUnavailable = 0;
  for (const row of source.rows) {
    const card = byId.get(row.giftCardId);
    if (!card || residualIds.has(card.id)) continue;
    if (card.merchantId !== row.merchantId || !card.officialUrl || canonicalUrl(card.officialUrl) !== canonicalUrl(row.officialUrl) || canonicalUrl(card.officialUrl) !== canonicalUrl(row.officialEvidence.requestedUrl) || !row.officialEvidence.ok || !row.officialEvidence.finalUrl) { sourceRowsStaleOrUnavailable += 1; continue; }
    sourceRowsMatched += 1;
    const existing = new Set(card.occasions.map((item) => item.occasion.slug));
    for (const rule of RULES) {
      const key = `${card.id}:${rule.slug}`;
      if (existing.has(rule.slug) || EXCLUDED_KEYS.has(key)) continue;
      const strong = [
        makeCandidate(card, rule, "OFFICIAL_TITLE", row.officialEvidence.title, 220, 100),
        makeCandidate(card, rule, "OFFICIAL_META_DESCRIPTION", row.officialEvidence.description, 220, 95),
        ...row.officialEvidence.headings.map((heading) => makeCandidate(card, rule, "OFFICIAL_HEADING", heading, 220, 95)),
      ].filter((candidate): candidate is Candidate => Boolean(candidate));
      for (const candidate of strong) choose(safe, candidate);
      if (safe.has(key)) continue;
      const body = makeCandidate(card, rule, "OFFICIAL_BODY_PROXIMITY", row.officialEvidence.excerpt, 120, 80);
      if (body) { choose(review, body); continue; }
      const navigation = makeCandidate(card, rule, "OFFICIAL_NAVIGATION_PROXIMITY", row.officialEvidence.navigation.join(" "), 80, 75);
      if (navigation) choose(review, navigation);
    }
  }
  for (const key of safe.keys()) review.delete(key);
  const actions = [...safe.values()].map((candidate): Action => { const occasionId = occasionBySlug.get(candidate.occasionSlug); if (!occasionId) throw new Error(`Missing active occasion: ${candidate.occasionSlug}`); const base = { ...candidate, occasionId }; return { actionId: hash(base), ...base }; }).sort((a, b) => a.giftCardId.localeCompare(b.giftCardId) || a.occasionSlug.localeCompare(b.occasionSlug));
  const reviews = [...review.values()].map((candidate): Review => ({ ...candidate, reason: candidate.evidenceSurface === "OFFICIAL_NAVIGATION_PROXIMITY" ? "NAVIGATION_CONTEXT_REQUIRES_MANUAL_REVIEW" : "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW" })).sort((a, b) => a.giftCardId.localeCompare(b.giftCardId) || a.occasionSlug.localeCompare(b.occasionSlug));
  const existingRelations = cards.reduce((sum, card) => sum + card.occasions.length, 0);
  const covered = new Set(cards.filter((card) => card.occasions.length).map((card) => card.id));
  const planBase = { version: VERSION, mode: "PREVIEW" as const, sourceReportId: source.reportId, residualAuditPlanId: audit.planId, sourceFingerprint: hash(source), residualAuditFingerprint: hash(audit), catalogFingerprint: catalogFingerprint(cards), occasionFingerprint: hash(occasions), summary: { totalGiftCards, activeCards: cards.length, existingRelations, cardsWithExistingOccasion: covered.size, sourceRowsMatched, sourceRowsStaleOrUnavailable, residualReviewCardsSkipped: cards.filter((card) => residualIds.has(card.id)).length, safeRelations: actions.length, safeCards: new Set(actions.map((action) => action.giftCardId)).size, newlyCoveredCards: new Set(actions.filter((action) => !covered.has(action.giftCardId)).map((action) => action.giftCardId)).size, reviewRelations: reviews.length, reviewCards: new Set(reviews.map((item) => item.giftCardId)).size, byOccasion: countBy(actions.map((action) => action.occasionSlug)), bySurface: countBy(actions.map((action) => action.evidenceSurface)), byVerificationStatus: countBy(actions.map((action) => action.verificationStatus)) }, actions, reviews };
  return { ...planBase, generatedAt: new Date().toISOString(), planId: hash(material(planBase)) };
}

function readStoredPlan() { const plan = readJson<Plan>(PLAN_JSON); verifyPlan(plan); if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) throw new Error("Apply/post-audit requires the exact --plan-id from preview."); return plan; }
async function stats() { const [giftCards, activeCards, relations, coveredCards] = await Promise.all([prisma.giftCard.count(), prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } } }), prisma.giftCardOccasion.count(), prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" }, occasions: { some: {} } } })]); return { giftCards, activeCards, relations, coveredCards }; }

async function preview() { const plan = await buildPlan(); fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8"); writeCsv(plan, PLAN_CSV); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(plan, null, 2)}\n`, "utf8"); console.log("Dorokartes Catalog Recipient Evidence v5 — PREVIEW"); console.log(`Plan ID: ${plan.planId}`); console.log(`Fresh official rows: ${plan.summary.sourceRowsMatched}`); console.log(`Safe: ${plan.summary.safeRelations} relations across ${plan.summary.safeCards} cards (${plan.summary.newlyCoveredCards} newly covered)`); console.log(`Review only: ${plan.summary.reviewRelations} relations across ${plan.summary.reviewCards} cards`); console.log("PREVIEW ONLY — no database rows changed."); }

async function applyPlan() {
  const plan = readStoredPlan(); const source = readJson<SourceReport>(SOURCE_JSON); const audit = readJson<ResidualAudit>(AUDIT_JSON); const cards = await loadCards(); const occasions = await prisma.occasion.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, slug: true } });
  if (source.reportId !== plan.sourceReportId || hash(source) !== plan.sourceFingerprint || audit.planId !== plan.residualAuditPlanId || hash(audit) !== plan.residualAuditFingerprint) throw new Error("Evidence or residual audit changed after preview.");
  if (catalogFingerprint(cards) !== plan.catalogFingerprint || hash(occasions) !== plan.occasionFingerprint) throw new Error("Catalog or occasion taxonomy changed after preview.");
  const before = await stats(); if (before.giftCards !== plan.summary.totalGiftCards || before.activeCards !== plan.summary.activeCards || before.relations !== plan.summary.existingRelations) throw new Error("Database counts changed after preview.");
  await prisma.$transaction(async (tx) => { const result = await tx.giftCardOccasion.createMany({ data: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId, relevance: action.relevance })) }); if (result.count !== plan.actions.length) throw new Error("Apply count mismatch."); }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 });
  const after = await stats(); if (after.giftCards !== before.giftCards || after.activeCards !== before.activeCards || after.relations !== before.relations + plan.actions.length) throw new Error("Post-apply invariant failed.");
  const report = { version: VERSION, mode: "APPLY", appliedAt: new Date().toISOString(), planId: plan.planId, applied: plan.actions.length, before, after }; fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8"); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(`APPLY ${report.applied}: relations ${before.relations} -> ${after.relations}; gift cards ${before.giftCards} -> ${after.giftCards}`);
}

async function postAudit() {
  const plan = readStoredPlan(); const applyReport = readJson<{ planId: string; applied: number; before: Awaited<ReturnType<typeof stats>>; after: Awaited<ReturnType<typeof stats>> }>(APPLY_JSON); if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) throw new Error("Apply report mismatch.");
  const rows = plan.actions.length ? await prisma.giftCardOccasion.findMany({ where: { OR: plan.actions.map((action) => ({ giftCardId: action.giftCardId, occasionId: action.occasionId })) }, select: { giftCardId: true, occasionId: true, relevance: true } }) : [];
  const failed = plan.actions.filter((action) => !rows.some((row) => row.giftCardId === action.giftCardId && row.occasionId === action.occasionId && row.relevance === action.relevance)); const current = await stats(); const invariants = { giftCardsPreserved: current.giftCards === applyReport.before.giftCards, activeCardsPreserved: current.activeCards === applyReport.before.activeCards, relationCountMatches: current.relations === applyReport.after.relations }; const report = { version: VERSION, mode: "POST_AUDIT", generatedAt: new Date().toISOString(), planId: plan.planId, checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action) => action.actionId), current, invariants, databaseWrites: 0 }; fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8"); fs.writeFileSync(path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"); if (failed.length || Object.values(invariants).some((value) => !value)) throw new Error("Post-audit failed."); console.log(`POST-AUDIT ${report.passed}/${report.checked}; gift cards preserved: ${current.giftCards}`);
}

async function main() { if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined."); if (APPLY) await applyPlan(); else if (POST_AUDIT) await postAudit(); else await preview(); }
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
