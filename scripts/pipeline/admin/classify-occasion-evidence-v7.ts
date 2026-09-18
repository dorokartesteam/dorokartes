import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "occasion-evidence-v7" as const;
const SOURCE_VERSION = "occasion-evidence-harvest-v7";
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv
  .find((value) => value.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_JSON = path.join(REPORT_DIR, "occasion-evidence-v7-source.json");
const AUDIT_JSON = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

const GIFT =
  String.raw`(?:gift\s*(?:card|cards|voucher|vouchers|certificate|certificates)|e\s*gift\s*card|egift|voucher|dorokart[\w]*|dwrokart[\w]*|doroepitag[\w]*|δωροκαρτ[α-ω]*|δωροεπιταγ[α-ω]*)`;
const RULES = [
  { slug: "birthday", term: String.raw`(?:birthday|birthdays|γενεθλ[α-ω]*)` },
  { slug: "name-day", term: String.raw`(?:name\s*day|nameday|ονομαστικ[α-ω]*(?:\s+εορτ[α-ω]*)?)` },
  { slug: "wedding", term: String.raw`(?:wedding|weddings|γαμ(?:ος|ου|ο|ους|ων))` },
  { slug: "anniversary", term: String.raw`(?:anniversary|anniversaries|επετει[α-ω]*)` },
  { slug: "new-baby", term: String.raw`(?:new\s+baby|baby\s+shower|newborn|νεογεννητ[α-ω]*|γεννησ[α-ω]*\s+μωρ[α-ω]*)` },
  { slug: "christening", term: String.raw`(?:christening|baptism|βαπτισ[α-ω]*)` },
  { slug: "graduation", term: String.raw`(?:graduation|graduate[\w]*|αποφοιτ[α-ω]*)` },
  { slug: "christmas", term: String.raw`(?:christmas|xmas|χριστουγεν[α-ω]*)` },
  { slug: "easter", term: String.raw`(?:easter|πασχ[α-ω]*)` },
  { slug: "valentines", term: String.raw`(?:valentine[\w]*|βαλεντιν[α-ω]*)` },
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

const EXCLUDED_KEYS = new Map([
  [
    "cmta1iy0a00ewq8iyav1zn7nb:wedding",
    "OFFICIAL_COPY_DESCRIBES_WEDDING_FAVORS_IN_THE_WIDER_RANGE_NOT_THE_GIFT_CARD",
  ],
]);

type HeadingEvidence = { level: 1 | 2 | 3; text: string };
type ProductEvidence = { type: string; name: string | null; description: string | null };
type FetchEvidence = {
  requestedUrl: string;
  requestedUrlCanonical: string | null;
  finalUrl: string | null;
  finalUrlCanonical: string | null;
  sameRegistrableDomain: boolean | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  description: string | null;
  headings: HeadingEvidence[];
  navigation: string[];
  products: ProductEvidence[];
  mainText: string | null;
  contentHash: string | null;
  error: string | null;
};
type CardMaterial = {
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  giftCardSlug: string;
  officialUrl: string | null;
  officialUrlCanonical: string | null;
  merchantWebsiteUrl: string | null;
  verificationStatus: string;
  corporateAvailable: boolean;
  activeVariantTypes: string[];
  existingOccasions: Array<{ occasionId: string; slug: string; relevance: number }>;
  giftCardUpdatedAt: string;
  merchantUpdatedAt: string;
};
type SourceRow = CardMaterial & { officialEvidence: FetchEvidence };
type SourceReport = {
  version: string;
  mode: string;
  scope: string;
  generatedAt: string;
  reportId: string;
  catalogFingerprint: string;
  cardCount: number;
  distinctOfficialUrlCount: number;
  rows: SourceRow[];
  [key: string]: unknown;
};
type CatalogAudit = {
  version: number;
  mode: string;
  scope: "NON_ARCHIVED" | "ALL";
  generatedAt: string;
  totalCards: number;
  catalogFingerprint: string;
  planId: string;
  actions: unknown[];
  reviews: Array<{ cardId: string; issues: string[] }>;
  [key: string]: unknown;
};
type Surface =
  | "STRUCTURED_CORPORATE"
  | "CARD_TITLE"
  | "CARD_SLUG"
  | "OFFICIAL_URL_PATH"
  | "OFFICIAL_PRODUCT"
  | "OFFICIAL_TITLE"
  | "OFFICIAL_META_SENTENCE"
  | "OFFICIAL_H1"
  | "OFFICIAL_SECONDARY_HEADING"
  | "OFFICIAL_BODY_SENTENCE"
  | "OFFICIAL_NAVIGATION";
type Match = {
  occasionSlug: string;
  status: "SAFE" | "REVIEW";
  relevance: number;
  surface: Surface;
  ruleId: string;
  snippet: string;
  reason: string | null;
};
type CommonDecision = {
  giftCardId: string;
  merchantId: string;
  merchantName: string;
  giftCardTitle: string;
  officialUrl: string;
  occasionSlug: string;
  relevance: number;
  evidenceSurface: Surface;
  evidenceSnippet: string;
  evidenceHash: string;
  ruleId: string;
};
type Action = CommonDecision & {
  type: "CREATE_OCCASION_RELATION";
  actionId: string;
  occasionId: string;
};
type Review = CommonDecision & { reason: string };
type Stats = {
  totalGiftCards: number;
  activeCards: number;
  relations: number;
  coveredActiveCards: number;
};
type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  sourceReportId: string;
  sourceFile: string;
  sourceFingerprint: string;
  catalogAuditPlanId: string;
  catalogAuditFile: string;
  catalogAuditFingerprint: string;
  catalogFingerprint: string;
  occasionFingerprint: string;
  before: Stats;
  summary: {
    sourceRows: number;
    usableOfficialPages: number;
    residualReviewCardsSkipped: number;
    unavailableOrUnsafePages: number;
    excludedKnownFalsePositives: number;
    safeRelations: number;
    safeCards: number;
    newlyCoveredCards: number;
    projectedCoveredCards: number;
    reviewRelations: number;
    reviewCards: number;
    byOccasion: Record<string, number>;
    bySurface: Record<string, number>;
    byReviewReason: Record<string, number>;
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
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
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

function pairSnippet(value: string | null | undefined, term: string, distance = 120) {
  const input = normalize(value);
  if (!input) return null;
  const pattern = new RegExp(
    `(?:${GIFT})[\\s\\S]{0,${distance}}(?:${term})|(?:${term})[\\s\\S]{0,${distance}}(?:${GIFT})`,
    "iu",
  );
  const match = pattern.exec(input);
  if (!match || match.index === undefined) return null;
  return input.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
}

function sentenceSnippet(value: string | null | undefined, term: string) {
  for (const sentence of (value || "").split(/(?<=[.!?;])\s+|[\r\n]+/)) {
    const snippet = pairSnippet(sentence, term, 120);
    if (snippet) return snippet;
  }
  return null;
}

function pageUnavailable(evidence: FetchEvidence) {
  const sample = normalize(
    `${evidence.title || ""} ${evidence.headings.map((item) => item.text).join(" ")} ${(evidence.mainText || "").slice(0, 1_500)}`,
  );
  return /(?:account suspended|plesk obsidian|under construction|page not found|404 not found|site unavailable)/i.test(
    sample,
  );
}

function dedicatedPage(row: SourceRow) {
  if (!row.officialUrlCanonical) return false;
  const official = new URL(row.officialUrlCanonical);
  if (/^(?:giftcard|gift-card|egift)\./i.test(official.hostname)) return true;
  const merchant = canonicalUrl(row.merchantWebsiteUrl);
  return official.pathname !== "/" && row.officialUrlCanonical !== merchant;
}

function countBy(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((item) => item === value).length,
    ]),
  );
}

function chooseMatch(map: Map<string, Match>, candidate: Match) {
  const current = map.get(candidate.occasionSlug);
  if (
    !current ||
    (candidate.status === "SAFE" && current.status !== "SAFE") ||
    (candidate.status === current.status && candidate.relevance > current.relevance)
  ) {
    map.set(candidate.occasionSlug, candidate);
  }
}

function classifyRow(row: SourceRow) {
  const matches = new Map<string, Match>();
  const verified = row.verificationStatus === "VERIFIED";
  const usablePage =
    row.officialEvidence.ok &&
    row.officialEvidence.sameRegistrableDomain === true &&
    Boolean(row.officialEvidence.contentHash) &&
    !pageUnavailable(row.officialEvidence);
  const dedicated = dedicatedPage(row);
  const safeIdentity = verified && usablePage;
  const safeOfficialSurface = verified && usablePage && dedicated;

  if (
    verified &&
    (row.corporateAvailable || row.activeVariantTypes.includes("CORPORATE"))
  ) {
    chooseMatch(matches, {
      occasionSlug: "corporate",
      status: "SAFE",
      relevance: 100,
      surface: "STRUCTURED_CORPORATE",
      ruleId: "structured-corporate-capability-v1",
      snippet: row.corporateAvailable
        ? "GiftCard.corporateAvailable=true"
        : "active GiftCardVariant.type=CORPORATE",
      reason: null,
    });
  }

  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(new URL(row.officialUrl || "").pathname);
  } catch {
    decodedPath = "";
  }

  for (const rule of RULES) {
    const identitySurfaces: Array<{
      surface: Surface;
      value: string | null;
      relevance: number;
      ruleId: string;
    }> = [
      {
        surface: "CARD_TITLE",
        value: row.giftCardTitle,
        relevance: 100,
        ruleId: "explicit-card-title-v1",
      },
      {
        surface: "CARD_SLUG",
        value: row.giftCardSlug,
        relevance: 98,
        ruleId: "explicit-card-slug-v1",
      },
      {
        surface: "OFFICIAL_URL_PATH",
        value: decodedPath,
        relevance: 96,
        ruleId: "explicit-official-url-path-v1",
      },
    ];
    for (const source of identitySurfaces) {
      const snippet = pairSnippet(source.value, rule.term, 120);
      if (!snippet) continue;
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: safeIdentity ? "SAFE" : "REVIEW",
        relevance: source.relevance,
        surface: source.surface,
        ruleId: `${source.ruleId}:${rule.slug}`,
        snippet,
        reason: safeIdentity
          ? null
          : verified
            ? "IDENTITY_MATCH_WITHOUT_USABLE_OFFICIAL_PAGE"
            : "IDENTITY_MATCH_ON_UNVERIFIED_CARD",
      });
      break;
    }

    for (const product of row.officialEvidence.products) {
      const snippet =
        pairSnippet(product.name, rule.term, 120) ||
        pairSnippet(product.description, rule.term, 120);
      if (!snippet) continue;
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: safeOfficialSurface ? "SAFE" : "REVIEW",
        relevance: product.name && pairSnippet(product.name, rule.term, 120) ? 100 : 96,
        surface: "OFFICIAL_PRODUCT",
        ruleId: `official-product-same-field-v1:${rule.slug}`,
        snippet,
        reason: safeOfficialSurface ? null : "PRODUCT_MATCH_NOT_ON_VERIFIED_DEDICATED_PAGE",
      });
      break;
    }

    const strongOfficial: Array<{
      surface: Surface;
      value: string | null;
      relevance: number;
      ruleId: string;
    }> = [
      {
        surface: "OFFICIAL_TITLE",
        value: row.officialEvidence.title,
        relevance: 100,
        ruleId: "official-title-same-surface-v1",
      },
      ...row.officialEvidence.headings
        .filter((heading) => heading.level === 1)
        .map((heading) => ({
          surface: "OFFICIAL_H1" as const,
          value: heading.text,
          relevance: 98,
          ruleId: "official-h1-same-surface-v1",
        })),
    ];
    for (const source of strongOfficial) {
      const snippet = pairSnippet(source.value, rule.term, 120);
      if (!snippet) continue;
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: safeOfficialSurface ? "SAFE" : "REVIEW",
        relevance: source.relevance,
        surface: source.surface,
        ruleId: `${source.ruleId}:${rule.slug}`,
        snippet,
        reason: safeOfficialSurface ? null : "STRONG_MATCH_NOT_ON_VERIFIED_DEDICATED_PAGE",
      });
      break;
    }

    const metaSnippet = sentenceSnippet(row.officialEvidence.description, rule.term);
    if (metaSnippet) {
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: safeOfficialSurface ? "SAFE" : "REVIEW",
        relevance: 95,
        surface: "OFFICIAL_META_SENTENCE",
        ruleId: `official-meta-same-sentence-v1:${rule.slug}`,
        snippet: metaSnippet,
        reason: safeOfficialSurface ? null : "META_MATCH_NOT_ON_VERIFIED_DEDICATED_PAGE",
      });
    }

    for (const heading of row.officialEvidence.headings.filter((item) => item.level > 1)) {
      const snippet = pairSnippet(heading.text, rule.term, 120);
      if (!snippet) continue;
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: "REVIEW",
        relevance: 82,
        surface: "OFFICIAL_SECONDARY_HEADING",
        ruleId: `official-secondary-heading-review-v1:${rule.slug}`,
        snippet,
        reason: "SECONDARY_HEADING_REQUIRES_MANUAL_REVIEW",
      });
      break;
    }

    const bodySnippet = sentenceSnippet(row.officialEvidence.mainText, rule.term);
    if (bodySnippet) {
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: "REVIEW",
        relevance: 78,
        surface: "OFFICIAL_BODY_SENTENCE",
        ruleId: `official-body-same-sentence-review-v1:${rule.slug}`,
        snippet: bodySnippet,
        reason: dedicated
          ? "BODY_SENTENCE_REQUIRES_MANUAL_REVIEW"
          : "MERCHANT_HOMEPAGE_CONTEXT_REQUIRES_MANUAL_REVIEW",
      });
    }

    for (const navigation of row.officialEvidence.navigation) {
      const snippet = pairSnippet(navigation, rule.term, 120);
      if (!snippet) continue;
      chooseMatch(matches, {
        occasionSlug: rule.slug,
        status: "REVIEW",
        relevance: 60,
        surface: "OFFICIAL_NAVIGATION",
        ruleId: `official-navigation-review-v1:${rule.slug}`,
        snippet,
        reason: "NAVIGATION_OR_FOOTER_CONTEXT_REQUIRES_MANUAL_REVIEW",
      });
      break;
    }
  }
  return [...matches.values()];
}

async function loadCards() {
  return prisma.giftCard.findMany({
    where: { status: "ACTIVE", merchant: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      verificationStatus: true,
      corporateAvailable: true,
      updatedAt: true,
      merchant: {
        select: { id: true, name: true, websiteUrl: true, updatedAt: true },
      },
      variants: {
        where: { active: true },
        orderBy: { id: "asc" },
        select: { type: true },
      },
      occasions: {
        orderBy: { occasionId: "asc" },
        select: {
          occasionId: true,
          relevance: true,
          occasion: { select: { slug: true } },
        },
      },
    },
  });
}

type CatalogCard = Awaited<ReturnType<typeof loadCards>>[number];

function cardMaterial(card: CatalogCard): CardMaterial {
  return {
    giftCardId: card.id,
    merchantId: card.merchantId,
    merchantName: card.merchant.name,
    giftCardTitle: card.title,
    giftCardSlug: card.slug,
    officialUrl: card.officialUrl,
    officialUrlCanonical: canonicalUrl(card.officialUrl),
    merchantWebsiteUrl: card.merchant.websiteUrl,
    verificationStatus: card.verificationStatus,
    corporateAvailable: card.corporateAvailable,
    activeVariantTypes: card.variants.map((variant) => variant.type).sort(),
    existingOccasions: card.occasions.map((relation) => ({
      occasionId: relation.occasionId,
      slug: relation.occasion.slug,
      relevance: relation.relevance,
    })),
    giftCardUpdatedAt: card.updatedAt.toISOString(),
    merchantUpdatedAt: card.merchant.updatedAt.toISOString(),
  };
}

function verifySource(source: SourceReport) {
  const { generatedAt: _generatedAt, reportId: _reportId, ...material } = source;
  void _generatedAt;
  void _reportId;
  if (
    source.version !== SOURCE_VERSION ||
    source.mode !== "EVIDENCE_ONLY" ||
    source.scope !== "ACTIVE_CATALOG" ||
    source.cardCount !== source.rows.length ||
    stableHash(material) !== source.reportId
  ) {
    throw new Error("Occasion v7 source report is invalid.");
  }
}

function verifyCatalogAudit(audit: CatalogAudit) {
  const expected = stableHash({
    version: audit.version,
    scope: audit.scope,
    totalCards: audit.totalCards,
    catalogFingerprint: audit.catalogFingerprint,
    actions: audit.actions,
    reviews: audit.reviews,
  });
  if (
    audit.version !== 11 ||
    audit.mode !== "PREVIEW" ||
    audit.scope !== "NON_ARCHIVED" ||
    audit.actions.length !== 0 ||
    expected !== audit.planId
  ) {
    throw new Error("Occasion v7 requires a fresh action-free v11 active-only audit.");
  }
}

function ensureImmutableCopy(sourcePath: string, basename: string, fingerprint: string) {
  const destination = path.join(REPORT_DIR, basename);
  if (fs.existsSync(destination)) {
    const existing = readJson<unknown>(destination);
    if (stableHash(existing) !== fingerprint) {
      throw new Error(`Immutable report collision: ${basename}`);
    }
  } else {
    fs.copyFileSync(sourcePath, destination);
  }
  return basename;
}

async function stats(): Promise<Stats> {
  const [totalGiftCards, activeCards, relations, coveredActiveCards] = await Promise.all([
    prisma.giftCard.count(),
    prisma.giftCard.count({ where: { status: "ACTIVE", merchant: { status: "ACTIVE" } } }),
    prisma.giftCardOccasion.count(),
    prisma.giftCard.count({
      where: {
        status: "ACTIVE",
        merchant: { status: "ACTIVE" },
        occasions: { some: { occasion: { active: true } } },
      },
    }),
  ]);
  return { totalGiftCards, activeCards, relations, coveredActiveCards };
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  void _generatedAt;
  void _planId;
  if (stableHash(planMaterial(material)) !== plan.planId) {
    throw new Error("Stored occasion v7 plan ID is invalid.");
  }
}

function readPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Apply/post-audit requires the exact --plan-id from PREVIEW.");
  }
  return plan;
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
    "evidenceHash",
    "ruleId",
    "reason",
    "officialUrl",
    "actionId",
  ];
  const rows = [
    ...plan.actions.map((action) => ({ status: "SAFE", reason: "", ...action })),
    ...plan.reviews.map((review) => ({ status: "REVIEW", actionId: "", ...review })),
  ];
  fs.writeFileSync(
    PLAN_CSV,
    `\uFEFF${[
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) =>
            csvEscape((row as unknown as Record<string, unknown>)[header]),
          )
          .join(","),
      ),
    ].join("\n")}\n`,
    "utf8",
  );
}

async function buildPlan(): Promise<Plan> {
  const source = readJson<SourceReport>(SOURCE_JSON);
  const audit = readJson<CatalogAudit>(AUDIT_JSON);
  verifySource(source);
  verifyCatalogAudit(audit);
  const sourceFingerprint = stableHash(source);
  const auditFingerprint = stableHash(audit);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sourceFile = ensureImmutableCopy(
    SOURCE_JSON,
    `occasion-evidence-v7-source-${source.reportId.slice(0, 16)}.json`,
    sourceFingerprint,
  );
  const catalogAuditFile = ensureImmutableCopy(
    AUDIT_JSON,
    `full-catalog-cleanup-v11-plan-${audit.planId.slice(0, 16)}.json`,
    auditFingerprint,
  );

  const [cards, occasions, before] = await Promise.all([
    loadCards(),
    prisma.occasion.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      select: { id: true, slug: true },
    }),
    stats(),
  ]);
  const materials = cards.map(cardMaterial);
  if (
    source.cardCount !== cards.length ||
    source.catalogFingerprint !== stableHash(materials) ||
    audit.totalCards !== cards.length
  ) {
    throw new Error("Source evidence, v11 audit, and current active catalog do not match.");
  }
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const occasionBySlug = new Map(occasions.map((occasion) => [occasion.slug, occasion.id]));
  const residualReviewIds = new Set(audit.reviews.map((review) => review.cardId));
  const safe = new Map<string, Action>();
  const review = new Map<string, Review>();
  let residualReviewCardsSkipped = 0;
  let unavailableOrUnsafePages = 0;
  let excludedKnownFalsePositives = 0;

  for (const row of source.rows) {
    const card = cardsById.get(row.giftCardId);
    if (!card) throw new Error(`Source card is no longer active: ${row.giftCardId}`);
    if (
      !row.officialEvidence.ok ||
      row.officialEvidence.sameRegistrableDomain !== true ||
      !row.officialEvidence.contentHash ||
      pageUnavailable(row.officialEvidence)
    ) {
      unavailableOrUnsafePages += 1;
    }
    if (residualReviewIds.has(row.giftCardId)) {
      residualReviewCardsSkipped += 1;
      continue;
    }
    const existing = new Set(card.occasions.map((item) => item.occasion.slug));
    for (const match of classifyRow(row)) {
      if (existing.has(match.occasionSlug)) continue;
      const key = `${row.giftCardId}:${match.occasionSlug}`;
      if (EXCLUDED_KEYS.has(key)) {
        excludedKnownFalsePositives += 1;
        continue;
      }
      const common: CommonDecision = {
        giftCardId: row.giftCardId,
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        giftCardTitle: row.giftCardTitle,
        officialUrl: row.officialUrl || "",
        occasionSlug: match.occasionSlug,
        relevance: match.relevance,
        evidenceSurface: match.surface,
        evidenceSnippet: match.snippet,
        evidenceHash:
          row.officialEvidence.contentHash ||
          stableHash({
            giftCardId: row.giftCardId,
            surface: match.surface,
            snippet: match.snippet,
          }),
        ruleId: match.ruleId,
      };
      const occasionId = occasionBySlug.get(match.occasionSlug);
      if (match.status === "SAFE" && occasionId) {
        const base = { ...common, occasionId };
        safe.set(key, {
          type: "CREATE_OCCASION_RELATION",
          actionId: stableHash(base),
          ...base,
        });
        review.delete(key);
      } else if (!safe.has(key)) {
        review.set(key, {
          ...common,
          reason: occasionId
            ? match.reason || "MANUAL_REVIEW_REQUIRED"
            : "ACTIVE_OCCASION_DEFINITION_MISSING",
        });
      }
    }
  }

  const actions = [...safe.values()].sort(
    (left, right) =>
      left.giftCardId.localeCompare(right.giftCardId) ||
      left.occasionSlug.localeCompare(right.occasionSlug),
  );
  const reviews = [...review.values()].sort(
    (left, right) =>
      left.giftCardId.localeCompare(right.giftCardId) ||
      left.occasionSlug.localeCompare(right.occasionSlug),
  );
  const alreadyCovered = new Set(
    cards.filter((card) => card.occasions.length > 0).map((card) => card.id),
  );
  const newlyCoveredCards = new Set(
    actions
      .filter((action) => !alreadyCovered.has(action.giftCardId))
      .map((action) => action.giftCardId),
  ).size;
  const base = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    sourceFile,
    sourceFingerprint,
    catalogAuditPlanId: audit.planId,
    catalogAuditFile,
    catalogAuditFingerprint: auditFingerprint,
    catalogFingerprint: stableHash(materials),
    occasionFingerprint: stableHash(occasions),
    before,
    summary: {
      sourceRows: source.rows.length,
      usableOfficialPages: source.rows.length - unavailableOrUnsafePages,
      residualReviewCardsSkipped,
      unavailableOrUnsafePages,
      excludedKnownFalsePositives,
      safeRelations: actions.length,
      safeCards: new Set(actions.map((action) => action.giftCardId)).size,
      newlyCoveredCards,
      projectedCoveredCards: before.coveredActiveCards + newlyCoveredCards,
      reviewRelations: reviews.length,
      reviewCards: new Set(reviews.map((item) => item.giftCardId)).size,
      byOccasion: countBy(actions.map((action) => action.occasionSlug)),
      bySurface: countBy(actions.map((action) => action.evidenceSurface)),
      byReviewReason: countBy(reviews.map((item) => item.reason)),
    },
    actions,
    reviews,
  };
  return {
    ...base,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(base)),
  };
}

async function preview() {
  const plan = await buildPlan();
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(plan);
  console.log("Dorokartes Occasion Evidence v7 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Full source: ${plan.summary.sourceRows} active cards`);
  console.log(`Usable official pages: ${plan.summary.usableOfficialPages}`);
  console.log(
    `Safe: ${plan.summary.safeRelations} relations across ${plan.summary.safeCards} cards (${plan.summary.newlyCoveredCards} newly covered)`,
  );
  console.log(
    `Projected coverage: ${plan.summary.projectedCoveredCards}/${plan.before.activeCards}`,
  );
  console.log(
    `Review only: ${plan.summary.reviewRelations} relations across ${plan.summary.reviewCards} cards`,
  );
  console.log(`Residual-review cards skipped: ${plan.summary.residualReviewCardsSkipped}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

function readImmutableInputs(plan: Plan) {
  if (
    path.basename(plan.sourceFile) !== plan.sourceFile ||
    path.basename(plan.catalogAuditFile) !== plan.catalogAuditFile
  ) {
    throw new Error("Stored immutable input path is invalid.");
  }
  const source = readJson<SourceReport>(path.join(REPORT_DIR, plan.sourceFile));
  const audit = readJson<CatalogAudit>(path.join(REPORT_DIR, plan.catalogAuditFile));
  verifySource(source);
  verifyCatalogAudit(audit);
  if (
    source.reportId !== plan.sourceReportId ||
    stableHash(source) !== plan.sourceFingerprint ||
    audit.planId !== plan.catalogAuditPlanId ||
    stableHash(audit) !== plan.catalogAuditFingerprint
  ) {
    throw new Error("Immutable evidence or catalog audit changed after PREVIEW.");
  }
  return { source, audit };
}

async function applyPlan() {
  const plan = readPlan();
  readImmutableInputs(plan);
  const [cards, occasions, before] = await Promise.all([
    loadCards(),
    prisma.occasion.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      select: { id: true, slug: true },
    }),
    stats(),
  ]);
  if (
    stableHash(cards.map(cardMaterial)) !== plan.catalogFingerprint ||
    stableHash(occasions) !== plan.occasionFingerprint ||
    stableHash(before) !== stableHash(plan.before)
  ) {
    throw new Error("Catalog, occasion taxonomy, or counts changed after PREVIEW.");
  }
  const existing = plan.actions.length
    ? await prisma.giftCardOccasion.findMany({
        where: {
          OR: plan.actions.map((action) => ({
            giftCardId: action.giftCardId,
            occasionId: action.occasionId,
          })),
        },
        select: { giftCardId: true, occasionId: true },
      })
    : [];
  if (existing.length) {
    throw new Error("At least one planned occasion relation already exists.");
  }
  await prisma.$transaction(
    async (tx) => {
      const result = await tx.giftCardOccasion.createMany({
        data: plan.actions.map((action) => ({
          giftCardId: action.giftCardId,
          occasionId: action.occasionId,
          relevance: action.relevance,
        })),
      });
      if (result.count !== plan.actions.length) {
        throw new Error("Occasion v7 apply count mismatch.");
      }
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const after = await stats();
  if (
    after.totalGiftCards !== before.totalGiftCards ||
    after.activeCards !== before.activeCards ||
    after.relations !== before.relations + plan.actions.length ||
    after.coveredActiveCards !==
      before.coveredActiveCards + plan.summary.newlyCoveredCards
  ) {
    throw new Error("Occasion v7 post-apply invariant failed.");
  }
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    applied: plan.actions.length,
    before,
    after,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `APPLY ${report.applied}: relations ${before.relations} -> ${after.relations}; covered ${before.coveredActiveCards} -> ${after.coveredActiveCards}`,
  );
}

async function postAudit() {
  const plan = readPlan();
  readImmutableInputs(plan);
  const applyReport = readJson<{
    planId: string;
    applied: number;
    before: Stats;
    after: Stats;
  }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Occasion v7 apply report does not match the requested plan.");
  }
  const rows = plan.actions.length
    ? await prisma.giftCardOccasion.findMany({
        where: {
          OR: plan.actions.map((action) => ({
            giftCardId: action.giftCardId,
            occasionId: action.occasionId,
          })),
        },
        select: { giftCardId: true, occasionId: true, relevance: true },
      })
    : [];
  const failed = plan.actions.filter(
    (action) =>
      !rows.some(
        (row) =>
          row.giftCardId === action.giftCardId &&
          row.occasionId === action.occasionId &&
          row.relevance === action.relevance,
      ),
  );
  const current = await stats();
  const invariants = {
    totalGiftCardsPreserved: current.totalGiftCards === applyReport.before.totalGiftCards,
    activeCardsPreserved: current.activeCards === applyReport.before.activeCards,
    relationCountMatches: current.relations === applyReport.after.relations,
    coveredCardCountMatches:
      current.coveredActiveCards === applyReport.after.coveredActiveCards,
  };
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: plan.actions.length,
    passed: plan.actions.length - failed.length,
    failed: failed.map((action) => action.actionId),
    current,
    invariants,
    databaseWrites: 0,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (failed.length || Object.values(invariants).some((value) => !value)) {
    throw new Error("Occasion v7 post-audit failed.");
  }
  console.log(
    `POST-AUDIT ${report.passed}/${report.checked}; covered cards: ${current.coveredActiveCards}`,
  );
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) return applyPlan();
  if (POST_AUDIT) return postAudit();
  return preview();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
