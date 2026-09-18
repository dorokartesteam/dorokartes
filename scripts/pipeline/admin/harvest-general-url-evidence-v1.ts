import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { chromium, type Page } from "playwright";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = 1 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const CONCURRENCY_ARG = process.argv.find((argument) => argument.startsWith("--concurrency="));
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.min(8, Math.max(1, Number(CONCURRENCY_ARG.split("=")[1])))
  : 5;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_PLAN = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const PLAN_JSON = path.join(REPORT_DIR, "general-url-evidence-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "general-url-evidence-v1-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "general-url-evidence-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "general-url-evidence-v1-post-audit.json");

const GIFT_PATTERN =
  /(?:gift[-_ ]?(?:card|cards|voucher|vouchers)|voucher|δωροκάρτ|δωροκαρτ|δωροεπιταγ|dorokart|dwrokart|doroepitag|gifcard)/iu;
const PLURAL_GIFT_PATTERN =
  /(?:gift[-_ ]?(?:cards|vouchers)|δωροκάρτες|δωροκαρτες|δωροεπιταγές|δωροεπιταγες)/iu;
const TRACKING_KEYS = new Set(["gclid", "fbclid", "msclkid", "srsltid"]);

type SourceReview = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  title: string;
  officialUrl: string | null;
  issues: string[];
};
type SourcePlan = {
  planId: string;
  scope: "NON_ARCHIVED";
  reviews: SourceReview[];
};
type CandidateEvidence = {
  url: string;
  finalUrl: string | null;
  sourceText: string;
  statusCode: number | null;
  title: string | null;
  heading: string | null;
  giftLinks: number;
  denominationGiftLinks: number;
  safe: boolean;
  reasons: string[];
};
type Finding = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  title: string;
  officialUrl: string;
  currentFinalUrl: string | null;
  status: "SAFE" | "REVIEW" | "ERROR";
  reasons: string[];
  candidates: CandidateEvidence[];
};
type Action = {
  type: "UPDATE_OFFICIAL_URL";
  actionId: string;
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedTitle: string;
  expectedUrl: string;
  value: string;
  evidence: string[];
};
type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourcePlanId: string;
  targetFingerprint: string;
  planId: string;
  targetCount: number;
  summary: { safe: number; review: number; error: number; actions: number };
  actions: Action[];
  findings: Finding[];
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function domain(raw: string) {
  try {
    const url = new URL(raw);
    return getDomain(url.hostname) || url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function cleanTracking(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (TRACKING_KEYS.has(normalized) || normalized.startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString();
}

function urlContainsDenomination(raw: string) {
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname);
    return (
      GIFT_PATTERN.test(pathname) &&
      /(?:^|[-_/])\d+(?:[.,]\d+)?(?:\s*(?:eur|euro|e|€))?(?:[-_/]|$)/iu.test(pathname)
    );
  } catch {
    return false;
  }
}

function explicitGiftPath(raw: string) {
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname);
    if (!GIFT_PATTERN.test(pathname)) return false;
    return !/^\/(?:shop|products?|collections?)\/?$/iu.test(pathname);
  } catch {
    return false;
  }
}

function normalizeCandidate(raw: string) {
  try {
    const url = new URL(cleanTracking(raw));
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function pageLinks(page: Page) {
  return page.locator("a[href]").evaluateAll((elements) =>
    elements.map((element) => ({
      href: (element as HTMLAnchorElement).href,
      text: (element.textContent || "").replace(/\s+/g, " ").trim(),
    })),
  );
}

async function validateCandidate(page: Page, candidate: { url: string; text: string }, expectedDomain: string) {
  const evidence: CandidateEvidence = {
    url: candidate.url,
    finalUrl: null,
    sourceText: candidate.text,
    statusCode: null,
    title: null,
    heading: null,
    giftLinks: 0,
    denominationGiftLinks: 0,
    safe: false,
    reasons: [],
  };
  try {
    const response = await page.goto(candidate.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(700);
    evidence.statusCode = response?.status() ?? null;
    evidence.finalUrl = normalizeCandidate(page.url());
    evidence.title = await page.title();
    evidence.heading = await page.locator("h1").first().textContent().catch(() => null);
    if (!response?.ok()) evidence.reasons.push(`PAGE_HTTP_${response?.status() ?? "UNKNOWN"}`);
    if (!evidence.finalUrl || domain(evidence.finalUrl) !== expectedDomain) {
      evidence.reasons.push("CROSS_DOMAIN_REDIRECT");
    }
    if (evidence.finalUrl && urlContainsDenomination(evidence.finalUrl)) {
      evidence.reasons.push("CANDIDATE_REMAINS_DENOMINATION_SPECIFIC");
    }
    const identity = `${evidence.title || ""} ${evidence.heading || ""} ${decodeURIComponent(new URL(page.url()).pathname)}`;
    if (!GIFT_PATTERN.test(identity)) evidence.reasons.push("CANDIDATE_IDENTITY_NOT_GIFT_CARD");
    const links = await pageLinks(page);
    const uniqueGiftLinks = new Set<string>();
    const uniqueDenominationLinks = new Set<string>();
    for (const link of links) {
      const normalized = normalizeCandidate(link.href);
      if (!normalized || domain(normalized) !== expectedDomain) continue;
      let decoded = "";
      try {
        decoded = decodeURIComponent(new URL(normalized).pathname);
      } catch {
        continue;
      }
      if (!GIFT_PATTERN.test(`${decoded} ${link.text}`)) continue;
      uniqueGiftLinks.add(normalized);
      if (urlContainsDenomination(normalized) || /(?:€|\bEUR\b|ευρώ|ευρω)\s*\d+|\d+\s*(?:€|\bEUR\b|ευρώ|ευρω)/iu.test(link.text)) {
        uniqueDenominationLinks.add(normalized);
      }
    }
    evidence.giftLinks = uniqueGiftLinks.size;
    evidence.denominationGiftLinks = uniqueDenominationLinks.size;
    const categoryPath = evidence.finalUrl
      ? /\/(?:product-category|collections?|categories?)\/[^?#]*(?:gift|voucher|δωρο|dorokart|dwrokart|doroepitag)/iu.test(
          decodeURIComponent(new URL(evidence.finalUrl).pathname),
        )
      : false;
    const pluralIdentity = PLURAL_GIFT_PATTERN.test(identity);
    if (evidence.denominationGiftLinks < 2 && !(categoryPath && evidence.giftLinks >= 2) && !(pluralIdentity && evidence.giftLinks >= 2)) {
      evidence.reasons.push("MULTI_PROGRAM_EVIDENCE_MISSING");
    }
    evidence.safe = evidence.reasons.length === 0;
  } catch (error) {
    evidence.reasons.push(
      error instanceof Error && error.name === "TimeoutError"
        ? "PAGE_TIMEOUT"
        : error instanceof Error
          ? error.message
          : "PAGE_FAILED",
    );
  }
  return evidence;
}

async function loadTargets(ids: string[]) {
  return prisma.giftCard.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: { id: true, merchantId: true, title: true, officialUrl: true, status: true, verificationStatus: true, updatedAt: true },
  });
}

function targetFingerprint(cards: Awaited<ReturnType<typeof loadTargets>>) {
  return stableHash(
    cards.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      title: card.title,
      officialUrl: card.officialUrl,
      status: card.status,
      verificationStatus: card.verificationStatus,
      updatedAt: card.updatedAt.toISOString(),
    })),
  );
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(plan: Plan) {
  const headers = ["kind", "status", "cardId", "merchantId", "merchantName", "title", "expectedUrl", "value", "reasons", "evidence"];
  const rows: Array<Record<string, unknown>> = [
    ...plan.actions.map((action) => ({ kind: "ACTION", status: "SAFE", ...action })),
    ...plan.findings.map((finding) => ({
      kind: "FINDING",
      status: finding.status,
      cardId: finding.cardId,
      merchantId: finding.merchantId,
      merchantName: finding.merchantName,
      title: finding.title,
      expectedUrl: finding.officialUrl,
      value: finding.candidates.find((candidate) => candidate.safe)?.finalUrl || "",
      reasons: finding.reasons,
      evidence: finding.candidates,
    })),
  ];
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourcePlan): Promise<Plan> {
  if (source.scope !== "NON_ARCHIVED") throw new Error("URL evidence requires the NON_ARCHIVED v11 source plan.");
  const targets = source.reviews.filter(
    (review) => review.issues.includes("DENOMINATION_SPECIFIC_URL") && review.officialUrl,
  );
  const cards = await loadTargets(targets.map((target) => target.cardId));
  if (cards.length !== targets.length) throw new Error("A URL evidence target is missing from the database.");
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const target of targets) {
    const card = cardsById.get(target.cardId);
    if (
      !card ||
      card.merchantId !== target.merchantId ||
      card.title !== target.title ||
      card.officialUrl !== target.officialUrl ||
      card.status !== "ACTIVE"
    ) {
      throw new Error(`Source-plan drift for ${target.cardId}.`);
    }
  }
  const browser = await chromium.launch({ headless: true });
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const findings = await Promise.all(
    targets.map((target) =>
      limit(async (): Promise<Finding> => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        try {
          const response = await page.goto(target.officialUrl!, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(700);
          const finalUrl = normalizeCandidate(page.url());
          if (!response?.ok() || !finalUrl) {
            return {
              cardId: target.cardId,
              merchantId: target.merchantId,
              merchantName: target.merchantName,
              title: target.title,
              officialUrl: target.officialUrl!,
              currentFinalUrl: finalUrl,
              status: "ERROR",
              reasons: [`CURRENT_PAGE_HTTP_${response?.status() ?? "UNKNOWN"}`],
              candidates: [],
            };
          }
          const expectedDomain = domain(finalUrl);
          if (!expectedDomain || expectedDomain !== domain(target.officialUrl!)) {
            return {
              cardId: target.cardId,
              merchantId: target.merchantId,
              merchantName: target.merchantName,
              title: target.title,
              officialUrl: target.officialUrl!,
              currentFinalUrl: finalUrl,
              status: "REVIEW",
              reasons: ["CURRENT_PAGE_CROSS_DOMAIN_REDIRECT"],
              candidates: [],
            };
          }
          const rawLinks = await pageLinks(page);
          const candidatesByUrl = new Map<string, { url: string; text: string }>();
          for (const link of rawLinks) {
            const normalized = normalizeCandidate(link.href);
            if (!normalized || domain(normalized) !== expectedDomain || normalized === finalUrl) continue;
            let decodedPath = "";
            try {
              decodedPath = decodeURIComponent(new URL(normalized).pathname);
            } catch {
              continue;
            }
            if (!GIFT_PATTERN.test(`${decodedPath} ${link.text}`)) continue;
            if (!explicitGiftPath(normalized) || urlContainsDenomination(normalized)) continue;
            const existing = candidatesByUrl.get(normalized);
            if (!existing || link.text.length > existing.text.length) candidatesByUrl.set(normalized, { url: normalized, text: link.text });
          }
          const ranked = [...candidatesByUrl.values()]
            .sort((a, b) => {
              const score = (item: { url: string; text: string }) =>
                (PLURAL_GIFT_PATTERN.test(`${item.url} ${item.text}`) ? 50 : 0) +
                (/product-category|collections?|categories?/iu.test(item.url) ? 30 : 0) +
                (item.url.length < finalUrl.length ? 10 : 0);
              return score(b) - score(a) || a.url.localeCompare(b.url);
            })
            .slice(0, 3);
          const candidates: CandidateEvidence[] = [];
          for (const candidate of ranked) {
            candidates.push(await validateCandidate(page, candidate, expectedDomain));
          }
          const safeCandidates = candidates.filter((candidate) => candidate.safe && candidate.finalUrl);
          const uniqueSafe = [...new Map(safeCandidates.map((candidate) => [candidate.finalUrl!, candidate])).values()];
          return {
            cardId: target.cardId,
            merchantId: target.merchantId,
            merchantName: target.merchantName,
            title: target.title,
            officialUrl: target.officialUrl!,
            currentFinalUrl: finalUrl,
            status: uniqueSafe.length === 1 ? "SAFE" : "REVIEW",
            reasons:
              uniqueSafe.length === 1
                ? ["SAME_OFFICIAL_DOMAIN", "GENERAL_GIFT_PAGE", "MULTIPLE_GIFT_CARD_OPTIONS"]
                : uniqueSafe.length > 1
                  ? ["MULTIPLE_SAFE_GENERAL_URLS"]
                  : ["NO_VALIDATED_GENERAL_GIFT_URL"],
            candidates,
          };
        } catch (error) {
          return {
            cardId: target.cardId,
            merchantId: target.merchantId,
            merchantName: target.merchantName,
            title: target.title,
            officialUrl: target.officialUrl!,
            currentFinalUrl: null,
            status: "ERROR",
            reasons: [
              error instanceof Error && error.name === "TimeoutError"
                ? "CURRENT_PAGE_TIMEOUT"
                : error instanceof Error
                  ? error.message
                  : "CURRENT_PAGE_FAILED",
            ],
            candidates: [],
          };
        } finally {
          completed += 1;
          if (completed % 5 === 0 || completed === targets.length) console.log(`Progress: ${completed}/${targets.length}`);
          await page.close();
        }
      }),
    ),
  );
  await browser.close();
  findings.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.cardId.localeCompare(b.cardId));
  const actions = findings.flatMap((finding): Action[] => {
    if (finding.status !== "SAFE") return [];
    const candidate = finding.candidates.find((item) => item.safe && item.finalUrl);
    if (!candidate?.finalUrl || candidate.finalUrl === finding.officialUrl) return [];
    return [
      {
        type: "UPDATE_OFFICIAL_URL",
        actionId: `update-validated-general-url:${finding.cardId}`,
        cardId: finding.cardId,
        merchantId: finding.merchantId,
        merchantName: finding.merchantName,
        expectedTitle: finding.title,
        expectedUrl: finding.officialUrl,
        value: candidate.finalUrl,
        evidence: [
          "Same official merchant domain.",
          `Validated general page identity: ${candidate.title || candidate.heading || candidate.finalUrl}`,
          `General page exposes ${candidate.denominationGiftLinks} denomination-specific gift-card links.`,
        ],
      },
    ];
  });
  const summary = {
    safe: findings.filter((finding) => finding.status === "SAFE").length,
    review: findings.filter((finding) => finding.status === "REVIEW").length,
    error: findings.filter((finding) => finding.status === "ERROR").length,
    actions: actions.length,
  };
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourcePlanId: source.planId,
    targetFingerprint: targetFingerprint(cards),
    targetCount: targets.length,
    summary,
    actions,
    findings,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(material) };
}

function verifyPlan(plan: Plan) {
  const material = {
    version: plan.version,
    mode: plan.mode,
    sourcePlanId: plan.sourcePlanId,
    targetFingerprint: plan.targetFingerprint,
    targetCount: plan.targetCount,
    summary: plan.summary,
    actions: plan.actions,
    findings: plan.findings,
  };
  if (stableHash(material) !== plan.planId) throw new Error("Stored plan contents do not match planId.");
}

function assertPlanRequest(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("This operation requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
}

async function applyPlan(plan: Plan) {
  verifyPlan(plan);
  assertPlanRequest(plan);
  const cards = await loadTargets(plan.findings.map((finding) => finding.cardId));
  if (targetFingerprint(cards) !== plan.targetFingerprint) throw new Error("URL target state changed after preview.");
  const applied: Array<{ actionId: string; cardId: string; from: string; to: string }> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        const result = await tx.giftCard.updateMany({
          where: {
            id: action.cardId,
            merchantId: action.merchantId,
            title: action.expectedTitle,
            officialUrl: action.expectedUrl,
            status: "ACTIVE",
          },
          data: { officialUrl: action.value, verificationStatus: "NEEDS_REVIEW" },
        });
        if (result.count !== 1) throw new Error(`URL precondition failed for ${action.cardId}.`);
        applied.push({ actionId: action.actionId, cardId: action.cardId, from: action.expectedUrl, to: action.value });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  const report = { version: VERSION, mode: "APPLY", appliedAt: new Date().toISOString(), planId: plan.planId, appliedCount: applied.length, applied };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function postAudit(plan: Plan) {
  verifyPlan(plan);
  assertPlanRequest(plan);
  const cards = await loadTargets(plan.actions.map((action) => action.cardId));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const results = plan.actions.map((action) => {
    const card = byId.get(action.cardId);
    return {
      actionId: action.actionId,
      cardId: action.cardId,
      passed: Boolean(card && card.officialUrl === action.value && card.verificationStatus === "NEEDS_REVIEW"),
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
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.failed) throw new Error(`Post-audit failed for ${report.failed} URL actions.`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<SourcePlan>(SOURCE_PLAN);
  if (APPLY || POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    if (source.planId !== plan.sourcePlanId && APPLY) throw new Error("The active v11 source plan changed after preview.");
    if (APPLY) {
      const report = await applyPlan(plan);
      console.log("Dorokartes General URL Evidence v1 — APPLY");
      console.log(`Plan ID: ${plan.planId}`);
      console.log(`Applied: ${report.appliedCount}`);
      return;
    }
    const report = await postAudit(plan);
    console.log("Dorokartes General URL Evidence v1 — POST-AUDIT");
    console.log(`Checked: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan);
  fs.writeFileSync(
    path.join(REPORT_DIR, `general-url-evidence-v1-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes General URL Evidence v1 — PREVIEW");
  console.log(`Source plan: ${plan.sourcePlanId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`Safe: ${plan.summary.safe}`);
  console.log(`Review: ${plan.summary.review}`);
  console.log(`Error: ${plan.summary.error}`);
  console.log(`Actions: ${plan.summary.actions}`);
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
