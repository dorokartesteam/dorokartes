import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "occasion-page-evidence-v2" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_JSON = path.join(REPORT_DIR, "taxonomy-evidence-v2.json");
const CATALOG_AUDIT_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

const GIFT = String.raw`(?:gift\s*(?:card|cards|voucher|vouchers)|e\s*gift\s*card|voucher|dorokart\w*|dwrokart\w*|doroepitag\w*|δωροκαρτ\w*|δωροεπιταγ\w*)`;
const OCCASION_RULES = [
  { slug: "birthday", term: String.raw`(?:birthday|birthdays|γενεθλ[α-ω]*)` },
  { slug: "name-day", term: String.raw`(?:name\s*day|nameday|ονομαστικ[α-ω]*(?:\s+εορτ[α-ω]*)?)` },
  { slug: "wedding", term: String.raw`(?:wedding|weddings|γαμ(?:ος|ου|ο|ους|ων))` },
  { slug: "anniversary", term: String.raw`(?:anniversary|anniversaries|επετει[α-ω]*)` },
  {
    slug: "new-baby",
    term: String.raw`(?:new\s+baby|baby\s+shower|νεογεννη[α-ω]*|δωρ[α-ω]*\s+γεννησ[α-ω]*|γεννησ[α-ω]*\s+μωρ[α-ω]*)`,
  },
  { slug: "christening", term: String.raw`(?:christening|baptism|βαπτισ[α-ω]*)` },
  { slug: "graduation", term: String.raw`(?:graduation|graduate\w*|αποφοιτ[α-ω]*)` },
  { slug: "christmas", term: String.raw`(?:christmas|xmas|χριστουγεν[α-ω]*)` },
  { slug: "easter", term: String.raw`(?:easter|πασχ[α-ω]*)` },
  { slug: "valentines", term: String.raw`(?:valentine\w*|βαλεντιν[α-ω]*)` },
  { slug: "mothers-day", term: String.raw`(?:mother'?s\s+day|mothers\s+day|γιορτ[α-ω]*\s+τ[α-ω]*\s+μητερ[α-ω]*)` },
  { slug: "fathers-day", term: String.raw`(?:father'?s\s+day|fathers\s+day|γιορτ[α-ω]*\s+τ[α-ω]*\s+πατερ[α-ω]*)` },
  { slug: "thank-you", term: String.raw`(?:thank\s+you|thanks|ευχαριστ[α-ω]*)` },
  { slug: "retirement", term: String.raw`(?:retirement|συνταξιοδοτ[α-ω]*)` },
  { slug: "for-her", term: String.raw`(?:for\s+her|για\s+εκεινη)` },
  { slug: "for-him", term: String.raw`(?:for\s+him|για\s+εκεινον)` },
  { slug: "for-kids", term: String.raw`(?:for\s+(?:kids|children)|για\s+παιδ[α-ω]*)` },
  { slug: "corporate", term: String.raw`(?:corporate|business\s+gift|employee\s+gift|εταιρικ[α-ω]*)` },
  { slug: "just-because", term: String.raw`(?:just\s+because|χωρις\s+αφορμη|απλ[α-ω]*\s+επειδη)` },
] as const;

const EXCLUDED_MATCHES = new Map([
  [
    "cmta1iy0a00ewq8iyav1zn7nb:wedding",
    "The matched official metadata describes wedding/shower favors in the wider product range, not a wedding use for the gift card.",
  ],
]);

type PageEvidence = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  description: string | null;
  headings: string[];
  navigation: string[];
  excerpt: string | null;
  error: string | null;
};

type SourceRow = {
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  officialUrl: string | null;
  websiteUrl: string | null;
  officialEvidence: PageEvidence;
  websiteEvidence: PageEvidence;
};

type SourceReport = {
  version: string;
  mode: string;
  cardCount: number;
  rows: SourceRow[];
  reportId: string;
};

type CatalogAudit = {
  planId: string;
  scope: "NON_ARCHIVED" | "ALL";
  reviews: Array<{ cardId: string; issues: string[] }>;
};

type Match = {
  occasionSlug: string;
  surface: "OFFICIAL_TITLE" | "OFFICIAL_META_DESCRIPTION" | "OFFICIAL_HEADING" | "OFFICIAL_BODY_PROXIMITY";
  status: "SAFE" | "REVIEW";
  relevance: number;
  snippet: string;
};

type Action = {
  type: "CREATE_OCCASION_RELATION";
  actionId: string;
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  officialUrl: string;
  occasionId: string;
  occasionSlug: string;
  relevance: number;
  evidenceSurface: Match["surface"];
  evidenceSnippet: string;
};

type Review = Omit<Action, "type" | "actionId" | "occasionId"> & {
  reason: "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW" | "OCCASION_DEFINITION_MISSING";
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
    sourceReportId: string;
  catalogAuditPlanId: string;
  sourceFingerprint: string;
  catalogAuditFingerprint: string;
  catalogFingerprint: string;
  planId: string;
  summary: {
    activeCards: number;
    sourceRowsMatched: number;
    safeRelations: number;
    safeCards: number;
    reviewRelations: number;
    skippedStaleOrUnavailable: number;
    skippedResidualReview: number;
    excludedFalsePositiveMatches: number;
    byOccasion: Record<string, number>;
  };
  actions: Action[];
  reviews: Review[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[_/|?&=+.-]+/g, " ")
    .replace(/[^a-z0-9α-ω'\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|msclkid|srsltid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function proximityPattern(term: string, distance: number) {
  return new RegExp(
    `(?:${GIFT})[\\s\\S]{0,${distance}}(?:${term})|(?:${term})[\\s\\S]{0,${distance}}(?:${GIFT})`,
    "iu",
  );
}

function snippetFor(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, match.index - 90);
  const end = Math.min(text.length, match.index + match[0].length + 90);
  return text.slice(start, end).trim();
}

function evidenceMatches(evidence: PageEvidence) {
  const matches: Match[] = [];
  const strongSurfaces: Array<{
    surface: Match["surface"];
    relevance: number;
    value: string;
  }> = [
    { surface: "OFFICIAL_TITLE", relevance: 100, value: normalize(evidence.title) },
    { surface: "OFFICIAL_META_DESCRIPTION", relevance: 95, value: normalize(evidence.description) },
    ...evidence.headings.map((heading) => ({
      surface: "OFFICIAL_HEADING" as const,
      relevance: 95,
      value: normalize(heading),
    })),
  ];
  const body = normalize(evidence.excerpt);
  for (const rule of OCCASION_RULES) {
    const strongPattern = proximityPattern(rule.term, 220);
    for (const source of strongSurfaces) {
      const snippet = snippetFor(source.value, strongPattern);
      if (!snippet) continue;
      matches.push({
        occasionSlug: rule.slug,
        surface: source.surface,
        status: "SAFE",
        relevance: source.relevance,
        snippet,
      });
      break;
    }
    if (matches.some((match) => match.occasionSlug === rule.slug)) continue;
    const bodySnippet = snippetFor(body, proximityPattern(rule.term, 120));
    if (bodySnippet) {
      matches.push({
        occasionSlug: rule.slug,
        surface: "OFFICIAL_BODY_PROXIMITY",
        status: "REVIEW",
        relevance: 80,
        snippet: bodySnippet,
      });
    }
  }
  return matches;
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
      merchant: { select: { name: true } },
      occasions: {
        orderBy: { occasionId: "asc" },
        select: { occasionId: true, relevance: true, occasion: { select: { slug: true } } },
      },
    },
  });
}

type CatalogCard = Awaited<ReturnType<typeof loadCards>>[number];

function fingerprintCards(cards: CatalogCard[]) {
  return stableHash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      title: card.title,
      officialUrl: card.officialUrl,
      merchantName: card.merchant.name,
      occasions: card.occasions.map((relation) => ({
        occasionId: relation.occasionId,
        slug: relation.occasion.slug,
        relevance: relation.relevance,
      })),
    })),
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
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(plan: Plan) {
  const headers = [
    "status",
    "giftCardId",
    "merchantName",
    "giftCardTitle",
    "occasionSlug",
    "relevance",
    "evidenceSurface",
    "evidenceSnippet",
    "officialUrl",
    "reason",
    "actionId",
  ];
  const rows = [
    ...plan.actions.map((action) => ({ status: "SAFE", ...action, reason: "" })),
    ...plan.reviews.map((review) => ({ status: "REVIEW", ...review, actionId: "" })),
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape((row as unknown as Record<string, unknown>)[header])).join(","),
    ),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(): Promise<Plan> {
  const source = readJson<SourceReport>(SOURCE_JSON);
  const catalogAudit = readJson<CatalogAudit>(CATALOG_AUDIT_JSON);
  if (
    source.version !== "taxonomy-evidence-v2" ||
    source.mode !== "EVIDENCE_ONLY" ||
    source.cardCount !== source.rows.length ||
    !source.reportId
  ) {
    throw new Error("Unexpected taxonomy evidence source.");
  }
  if (catalogAudit.scope !== "NON_ARCHIVED" || !catalogAudit.planId) {
    throw new Error("Occasion v2 requires the latest active-only v11 catalog audit.");
  }
  const residualReviewIds = new Set(catalogAudit.reviews.map((review) => review.cardId));
  const cards = await loadCards();
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const occasions = await prisma.occasion.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const actions: Action[] = [];
  const reviews: Review[] = [];
  let sourceRowsMatched = 0;
  let skippedStaleOrUnavailable = 0;
  let skippedResidualReview = 0;
  let excludedFalsePositiveMatches = 0;

  for (const row of source.rows) {
    const card = cardsById.get(row.giftCardId);
    if (!card) continue;
    if (residualReviewIds.has(card.id)) {
      skippedResidualReview += 1;
      continue;
    }
    if (
      card.merchantId !== row.merchantId ||
      !card.officialUrl ||
      canonicalUrl(card.officialUrl) !== canonicalUrl(row.officialUrl) ||
      canonicalUrl(card.officialUrl) !== canonicalUrl(row.officialEvidence.requestedUrl) ||
      !row.officialEvidence.ok ||
      !row.officialEvidence.finalUrl
    ) {
      skippedStaleOrUnavailable += 1;
      continue;
    }
    sourceRowsMatched += 1;
    const existing = new Set(card.occasions.map((relation) => relation.occasion.slug));
    for (const match of evidenceMatches(row.officialEvidence)) {
      if (existing.has(match.occasionSlug)) continue;
      if (EXCLUDED_MATCHES.has(`${card.id}:${match.occasionSlug}`)) {
        excludedFalsePositiveMatches += 1;
        continue;
      }
      const common = {
        giftCardId: card.id,
        merchantId: card.merchantId,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        officialUrl: card.officialUrl,
        occasionSlug: match.occasionSlug,
        relevance: match.relevance,
        evidenceSurface: match.surface,
        evidenceSnippet: match.snippet,
      };
      const occasionId = occasionBySlug.get(match.occasionSlug);
      if (!occasionId) {
        reviews.push({ ...common, reason: "OCCASION_DEFINITION_MISSING" });
      } else if (match.status === "REVIEW") {
        reviews.push({ ...common, reason: "BODY_CONTEXT_REQUIRES_MANUAL_REVIEW" });
      } else {
        const actionMaterial = { ...common, occasionId };
        actions.push({
          type: "CREATE_OCCASION_RELATION",
          actionId: stableHash(actionMaterial),
          ...actionMaterial,
        });
      }
    }
  }
  const byOccasion = Object.fromEntries(
    [...new Set(actions.map((action) => action.occasionSlug))]
      .sort()
      .map((slug) => [slug, actions.filter((action) => action.occasionSlug === slug).length]),
  );
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    catalogAuditPlanId: catalogAudit.planId,
    sourceFingerprint: stableHash(source),
    catalogAuditFingerprint: stableHash(catalogAudit),
    catalogFingerprint: fingerprintCards(cards),
    summary: {
      activeCards: cards.length,
      sourceRowsMatched,
      safeRelations: actions.length,
      safeCards: new Set(actions.map((action) => action.giftCardId)).size,
      reviewRelations: reviews.length,
      skippedStaleOrUnavailable,
      skippedResidualReview,
      excludedFalsePositiveMatches,
      byOccasion,
    },
    actions,
    reviews,
  };
  return {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
}

function readPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID) throw new Error("Apply/post-audit requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan);
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Occasion Page Evidence v2 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Active cards: ${plan.summary.activeCards}`);
  console.log(`Fresh official pages: ${plan.summary.sourceRowsMatched}`);
  console.log(`Safe relations: ${plan.summary.safeRelations} across ${plan.summary.safeCards} cards`);
  console.log(`Review only: ${plan.summary.reviewRelations}`);
  console.log(`Stale/unavailable skipped: ${plan.summary.skippedStaleOrUnavailable}`);
  console.log(`Residual-review cards skipped: ${plan.summary.skippedResidualReview}`);
  console.log(`Known false-positive matches excluded: ${plan.summary.excludedFalsePositiveMatches}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function applyPlan() {
  const plan = readPlan();
  const source = readJson<SourceReport>(SOURCE_JSON);
  const catalogAudit = readJson<CatalogAudit>(CATALOG_AUDIT_JSON);
  if (source.reportId !== plan.sourceReportId || stableHash(source) !== plan.sourceFingerprint) {
    throw new Error("Official-page evidence source changed after preview.");
  }
  if (
    catalogAudit.planId !== plan.catalogAuditPlanId ||
    stableHash(catalogAudit) !== plan.catalogAuditFingerprint
  ) {
    throw new Error("Active-only v11 audit changed after preview.");
  }
  const cards = await loadCards();
  if (fingerprintCards(cards) !== plan.catalogFingerprint) {
    throw new Error("Catalog/occasion state changed after preview. Generate a new plan.");
  }
  if (plan.actions.length) {
    await prisma.$transaction(
      async (tx) => {
        const result = await tx.giftCardOccasion.createMany({
          data: plan.actions.map((action) => ({
            giftCardId: action.giftCardId,
            occasionId: action.occasionId,
            relevance: action.relevance,
          })),
        });
        if (result.count !== plan.actions.length) throw new Error("Occasion relation apply count mismatch.");
      },
      { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
    );
  }
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    applied: plan.actions.length,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Occasion Page Evidence v2 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${report.applied}`);
}

async function postAudit() {
  const plan = readPlan();
  const applyReport = readJson<{ planId: string; applied: number }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Apply report does not match the requested preview.");
  }
  const relations = await prisma.giftCardOccasion.findMany({
    where: {
      OR: plan.actions.map((action) => ({
        giftCardId: action.giftCardId,
        occasionId: action.occasionId,
      })),
    },
    select: { giftCardId: true, occasionId: true, relevance: true },
  });
  const failed = plan.actions.filter(
    (action) =>
      !relations.some(
        (relation) =>
          relation.giftCardId === action.giftCardId &&
          relation.occasionId === action.occasionId &&
          relation.relevance === action.relevance,
      ),
  );
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: plan.actions.length,
    passed: plan.actions.length - failed.length,
    failed: failed.map((action) => action.actionId),
    databaseWrites: 0,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (failed.length) throw new Error(`Post-audit failed for ${failed.length} occasion relations.`);
  console.log("Dorokartes Occasion Page Evidence v2 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) await applyPlan();
  else if (POST_AUDIT) await postAudit();
  else await preview();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
