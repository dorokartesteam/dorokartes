import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDomain } from "tldts";
import {
  VerificationStatus,
  VerificationResult,
  SourceType,
} from "../../src/generated/prisma/client";
import { prisma } from "../../lib/prisma";

const VERSION = "verification-enrichment-v19b" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const LIMIT_ARG = process.argv.find((v) => v.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.slice("--limit=".length))) : 500;
const REQUESTED_PLAN_ID =
  process.argv.find((v) => v.startsWith("--plan-id="))?.slice("--plan-id=".length) ?? null;

const CONCURRENCY = Math.max(
  1,
  Math.min(12, Number(process.env.VERIFICATION_V19_CONCURRENCY || "6")),
);
const FETCH_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(30_000, Number(process.env.VERIFICATION_V19_TIMEOUT_MS || "15000")),
);
const REVIEW_DAYS = Math.max(7, Number(process.env.REVERIFY_DAYS || "30"));
const BATCH_SIZE = Math.max(
  1,
  Math.min(100, Number(process.env.VERIFICATION_V19_BATCH_SIZE || "40")),
);

const REPORT_DIR = path.join(process.cwd(), "reports", "master-reconciliation-v17");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);

function sha(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function domainOf(value: string | null | undefined) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return getDomain(host, { allowPrivateDomains: true }) ?? host;
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8211;|&#x2013;/gi, "–")
    .replace(/&#8212;|&#x2014;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSemantic(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(html: string, tag: string) {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? normalizeText(m[1]).slice(0, 700) : "";
}

function decodedUrlBasis(value: string) {
  try {
    const u = new URL(value);
    const raw = `${u.pathname} ${u.search}`;
    try {
      return `${raw} ${decodeURIComponent(raw)}`;
    } catch {
      return raw;
    }
  } catch {
    return value;
  }
}

const EN_GIFT_RE =
  /(?:\be[-_\s]?gift[-_\s]?cards?\b|\bgift[-_\s]?cards?\b|\bgiftcards?\b|\bgift[-_\s]?vouchers?\b|\bgiftvouchers?\b|\bvouchers?\b)/i;

const TRANSLIT_GIFT_RE =
  /(?:\bdoro?kart(?:a|es)?\b|\bdwro?kart(?:a|es)?\b|\bdoro?epitag(?:i|es)?\b|\bdwro?epitag(?:i|es)?\b|wps_wgm_giftcard|kbgiftcard)/i;

const GREEK_GIFT_RE =
  /(?:\u03b4\u03c9\u03c1\u03bf\u03ba\u03b1\u03c1\u03c4(?:\u03b1|\u03b5\u03c2)|\u03b4\u03c9\u03c1\u03bf\u03b5\u03c0\u03b9\u03c4\u03b1\u03b3(?:\u03b7|\u03b5\u03c2))/i;

const BAD_ROLE_RE =
  /(?:terms(?:-and-conditions)?|privacy|cookie|refund|returns?|faq|help|support|gift[-_ ]?sets?|gift[-_ ]?ideas?)/i;

const VISIBLE_PURCHASE_RE =
  /(?:€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b|\bbuy\b|\bpurchase\b|\bamount\b|\bvalue\b|\bprice\b|\bcart\b|add[-_\s]?to[-_\s]?cart|checkout|\u03b1\u03b3\u03bf\u03c1(?:\u03b1|\u03ac)|\u03ba\u03b1\u03bb\u03b1\u03b8\u03b9|\u03c0\u03bf\u03c3\u03bf|\u03b1\u03be\u03b9\u03b1)/i;

const STRUCTURED_COMMERCE_RE =
  /(?:itemprop=["']price["']|pricecurrency|["']price["']\s*:|["']offers["']\s*:|name=["']add-to-cart["']|data-product-id=|\/cart\/add\b|woocommerce-variation-add-to-cart|single_add_to_cart_button)/i;

function hasGiftSemantic(value: string) {
  const normalized = normalizeSemantic(value);
  return (
    EN_GIFT_RE.test(normalized) ||
    TRANSLIT_GIFT_RE.test(normalized) ||
    GREEK_GIFT_RE.test(normalized)
  );
}

function extractExpectedAmount(title: string) {
  const normalized = title.replace(/,/g, ".");
  const patterns = [
    /(?:€|EUR)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|EUR)\b/i,
  ];
  for (const pattern of patterns) {
    const m = normalized.match(pattern);
    if (m) return Number(m[1]);
  }
  return null;
}

function amountAppears(amount: number | null, value: string) {
  if (amount == null || !Number.isFinite(amount)) return false;
  const integer = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const variants = new Set([
    integer,
    integer.replace(".", ","),
    `${integer}€`,
    `€${integer}`,
    `${integer} €`,
    `€ ${integer}`,
  ]);
  const normalized = value.replace(/\s+/g, " ");
  return [...variants].some((v) => normalized.includes(v));
}

function dateAfterDays(days: number) {
  return new Date(Date.now() + days * 86400_000);
}

async function fetchEvidence(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesVerification/19; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const html = /html|xhtml/i.test(contentType) ? await response.text() : "";
    const text = normalizeText(html).slice(0, 140_000);

    return {
      ok: response.ok,
      httpStatus: response.status,
      finalUrl: response.url || url,
      contentType,
      html,
      text,
      title: extractTag(html, "title"),
      h1: extractTag(html, "h1"),
      contentHash: html ? sha(text) : null,
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      ok: false,
      httpStatus: null as number | null,
      finalUrl: url,
      contentType: "",
      html: "",
      text: "",
      title: "",
      h1: "",
      contentHash: null as string | null,
      error: String(error?.name || error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

type Target = {
  id: string;
  merchantId: string;
  title: string;
  officialUrl: string;
  merchant: {
    name: string;
    websiteUrl: string;
    status: string;
  };
};

type Decision = {
  bucket: "AUTO_SAFE" | "REVIEW" | "ERROR";
  reason: string;
  cardId: string;
  merchantId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  expectedMerchantWebsiteUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  pageTitle: string;
  h1: string;
  contentHash: string | null;
  cardDomain: string | null;
  merchantDomain: string | null;
  finalDomain: string | null;
  semanticUrl: boolean;
  semanticTitle: boolean;
  semanticH1: boolean;
  semanticBody: boolean;
  visiblePurchaseSignal: boolean;
  structuredCommerceSignal: boolean;
  expectedAmount: number | null;
  expectedAmountFound: boolean;
  badRole: boolean;
};

function decide(target: Target, ev: Awaited<ReturnType<typeof fetchEvidence>>): Decision {
  const cardDomain = domainOf(target.officialUrl);
  const merchantDomain = domainOf(target.merchant.websiteUrl);
  const finalDomain = domainOf(ev.finalUrl);

  const urlBasis = decodedUrlBasis(ev.finalUrl);
  const bodySlice = ev.text.slice(0, 80_000);
  const semanticUrl = hasGiftSemantic(urlBasis);
  const semanticTitle = hasGiftSemantic(ev.title);
  const semanticH1 = hasGiftSemantic(ev.h1);
  const semanticBody = hasGiftSemantic(bodySlice);

  const visibleBasis = `${ev.title} ${ev.h1} ${bodySlice}`;
  const visiblePurchaseSignal = VISIBLE_PURCHASE_RE.test(normalizeSemantic(visibleBasis));
  const structuredCommerceSignal = STRUCTURED_COMMERCE_RE.test(ev.html.slice(0, 250_000));

  const expectedAmount = extractExpectedAmount(target.title);
  const expectedAmountFound = amountAppears(expectedAmount, visibleBasis);

  const badRole =
    BAD_ROLE_RE.test(normalizeSemantic(urlBasis)) &&
    !semanticTitle &&
    !semanticH1;

  const common = {
    cardId: target.id,
    merchantId: target.merchantId,
    merchantName: target.merchant.name,
    expectedTitle: target.title,
    expectedOfficialUrl: target.officialUrl,
    expectedMerchantWebsiteUrl: target.merchant.websiteUrl,
    finalUrl: ev.finalUrl,
    httpStatus: ev.httpStatus,
    pageTitle: ev.title,
    h1: ev.h1,
    contentHash: ev.contentHash,
    cardDomain,
    merchantDomain,
    finalDomain,
    semanticUrl,
    semanticTitle,
    semanticH1,
    semanticBody,
    visiblePurchaseSignal,
    structuredCommerceSignal,
    expectedAmount,
    expectedAmountFound,
    badRole,
  };

  if (ev.error) {
    return { bucket: "ERROR", reason: `FETCH_ERROR:${ev.error}`, ...common };
  }

  if (!ev.ok || ev.httpStatus == null || ev.httpStatus < 200 || ev.httpStatus >= 300) {
    return { bucket: "ERROR", reason: `HTTP_${ev.httpStatus ?? "UNKNOWN"}`, ...common };
  }

  if (!cardDomain || !merchantDomain || !finalDomain) {
    return { bucket: "REVIEW", reason: "DOMAIN_PARSE_FAILED", ...common };
  }

  if (cardDomain !== merchantDomain) {
    return {
      bucket: "REVIEW",
      reason: "OFFICIAL_URL_MERCHANT_DOMAIN_MISMATCH",
      ...common,
    };
  }

  if (finalDomain !== merchantDomain) {
    return { bucket: "REVIEW", reason: "REDIRECT_DOMAIN_MISMATCH", ...common };
  }

  if (badRole) {
    return {
      bucket: "REVIEW",
      reason: "TERMS_PRIVACY_GIFTSET_OR_SUPPORT_PAGE",
      ...common,
    };
  }

  const strongSemantic =
    semanticTitle ||
    semanticH1 ||
    (semanticUrl && semanticBody) ||
    (semanticUrl && hasGiftSemantic(target.title));

  if (!strongSemantic) {
    return { bucket: "REVIEW", reason: "NO_STRONG_GIFT_CARD_EVIDENCE", ...common };
  }

  const strongCommerce =
    visiblePurchaseSignal ||
    structuredCommerceSignal ||
    expectedAmountFound;

  if (!strongCommerce) {
    return { bucket: "REVIEW", reason: "NO_STRONG_PURCHASE_OR_VALUE_EVIDENCE", ...common };
  }

  return {
    bucket: "AUTO_SAFE",
    reason:
      "HTTP_OK_SAME_DOMAIN_STRONG_GIFT_CARD_SEMANTICS_AND_COMMERCE_EVIDENCE",
    ...common,
  };
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
) {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      if ((i + 1) % 25 === 0 || i + 1 === items.length) {
        console.log(`Progress: ${i + 1}/${items.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker),
  );

  return out;
}

async function getTargets(): Promise<Target[]> {
  return prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.NEEDS_REVIEW,
      officialUrl: { not: null },
      merchant: {
        status: "ACTIVE",
        websiteUrl: { not: null },
      },
    },
    take: LIMIT,
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          name: true,
          websiteUrl: true,
          status: true,
        },
      },
    },
  }) as Promise<Target[]>;
}

function targetMaterial(targets: Target[]) {
  return targets.map((t) => ({
    id: t.id,
    merchantId: t.merchantId,
    title: t.title,
    officialUrl: t.officialUrl,
    merchantName: t.merchant.name,
    merchantWebsiteUrl: t.merchant.websiteUrl,
    merchantStatus: t.merchant.status,
  }));
}

async function currentTargetFingerprint() {
  const targets = await getTargets();
  return sha(JSON.stringify(targetMaterial(targets)));
}

async function buildPlan() {
  const targets = await getTargets();
  const fingerprint = sha(JSON.stringify(targetMaterial(targets)));

  const decisions = await mapConcurrent(
    targets,
    CONCURRENCY,
    async (target) => decide(target, await fetchEvidence(target.officialUrl)),
  );

  const safe = decisions.filter((x) => x.bucket === "AUTO_SAFE");
  const review = decisions.filter((x) => x.bucket === "REVIEW");
  const errors = decisions.filter((x) => x.bucket === "ERROR");

  const material = {
    version: VERSION,
    targetCount: targets.length,
    targetFingerprint: fingerprint,
    autoSafeCount: safe.length,
    reviewCount: review.length,
    errorCount: errors.length,
    safe,
    review,
    errors,
  };

  return {
    ...material,
    mode: "PREVIEW",
    generatedAt: new Date().toISOString(),
    planId: sha(JSON.stringify(material)),
  };
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function writeCsv(plan: any) {
  const rows = [...plan.safe, ...plan.review, ...plan.errors];
  const header = [
    "bucket",
    "reason",
    "merchantName",
    "expectedTitle",
    "expectedOfficialUrl",
    "finalUrl",
    "httpStatus",
    "pageTitle",
    "h1",
    "semanticUrl",
    "semanticTitle",
    "semanticH1",
    "semanticBody",
    "visiblePurchaseSignal",
    "structuredCommerceSignal",
    "expectedAmount",
    "expectedAmountFound",
    "badRole",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map((k) => csvEscape(r[k])).join(","));
  }

  fs.writeFileSync(CSV, lines.join("\n") + "\n", "utf8");
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2) + "\n", "utf8");
  writeCsv(plan);

  console.log("Dorokartes Verification Enrichment v19 — PREVIEW");
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`AUTO_SAFE: ${plan.autoSafeCount}`);
  console.log(`REVIEW: ${plan.reviewCount}`);
  console.log(`ERROR: ${plan.errorCount}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log(`CSV: ${CSV}`);
  console.log("PREVIEW ONLY — database unchanged.");
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function applyPlan() {
  if (!fs.existsSync(PLAN_JSON)) {
    throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  }

  const saved = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));

  if (!REQUESTED_PLAN_ID) {
    throw new Error("Missing --plan-id=<PLAN_ID>.");
  }
  if (saved.planId !== REQUESTED_PLAN_ID) {
    throw new Error("Plan ID mismatch.");
  }

  const fingerprint = await currentTargetFingerprint();
  if (fingerprint !== saved.targetFingerprint) {
    throw new Error(
      "Target catalog state changed after preview. Generate and inspect a new v19 plan.",
    );
  }

  console.log(`Re-validating ${saved.safe.length} AUTO_SAFE candidates...`);

  const freshChecks = await mapConcurrent(
    saved.safe as Decision[],
    CONCURRENCY,
    async (row) => {
      const target: Target = {
        id: row.cardId,
        merchantId: row.merchantId,
        title: row.expectedTitle,
        officialUrl: row.expectedOfficialUrl,
        merchant: {
          name: row.merchantName,
          websiteUrl: row.expectedMerchantWebsiteUrl,
          status: "ACTIVE",
        },
      };
      return decide(target, await fetchEvidence(row.expectedOfficialUrl));
    },
  );

  const stableSafe: Decision[] = [];
  const skippedDrift: Decision[] = [];

  for (let i = 0; i < freshChecks.length; i++) {
    const fresh = freshChecks[i];
    const planned = saved.safe[i] as Decision;

    const stable =
      fresh.bucket === "AUTO_SAFE" &&
      fresh.finalDomain === planned.finalDomain &&
      fresh.cardDomain === planned.cardDomain &&
      fresh.merchantDomain === planned.merchantDomain;

    if (stable) stableSafe.push(planned);
    else skippedDrift.push(fresh);
  }

  console.log(`Stable AUTO_SAFE after live re-check: ${stableSafe.length}/${saved.safe.length}`);
  console.log(`Skipped due to live drift: ${skippedDrift.length}`);

  if (skippedDrift.length) {
    for (const row of skippedDrift.slice(0, 20)) {
      console.log(`SKIP: ${row.merchantName} (${row.cardId}) -> ${row.bucket}:${row.reason}`);
    }
  }

  if (!stableSafe.length) {
    throw new Error("No AUTO_SAFE candidates remained stable after live re-validation.");
  }

  const batches = chunk(stableSafe, BATCH_SIZE);
  let updatedCards = 0;
  let createdSources = 0;
  let createdEvents = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const result = await prisma.$transaction(
      async (tx) => {
        let u = 0;
        let s = 0;
        let e = 0;

        for (const row of batches[bi]) {
          const card = await tx.giftCard.findFirst({
            where: {
              id: row.cardId,
              merchantId: row.merchantId,
              title: row.expectedTitle,
              officialUrl: row.expectedOfficialUrl,
              status: "ACTIVE",
              verificationStatus: VerificationStatus.NEEDS_REVIEW,
              merchant: {
                name: row.merchantName,
                status: "ACTIVE",
                websiteUrl: row.expectedMerchantWebsiteUrl,
              },
            },
            select: { id: true },
          });

          if (!card) {
            throw new Error(`Precondition failed for ${row.cardId}`);
          }

          await tx.giftCard.update({
            where: { id: row.cardId },
            data: {
              verificationStatus: VerificationStatus.VERIFIED,
              lastVerifiedAt: new Date(),
              nextReviewAt: dateAfterDays(REVIEW_DAYS),
            },
          });
          u++;

          const source = await tx.sourceRecord.findFirst({
            where: {
              giftCardId: row.cardId,
              sourceType: SourceType.OFFICIAL,
              active: true,
            },
            select: { id: true },
          });

          if (!source) {
            await tx.sourceRecord.create({
              data: {
                sourceType: SourceType.OFFICIAL,
                sourceName: "Verification Enrichment v19",
                sourceUrl: row.expectedOfficialUrl,
                merchantId: row.merchantId,
                giftCardId: row.cardId,
                rawTitle: row.expectedTitle,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                active: true,
              },
            });
            s++;
          }

          const existingEvent = await tx.verificationEvent.findFirst({
            where: {
              giftCardId: row.cardId,
              result: VerificationResult.PASSED,
              url: row.expectedOfficialUrl,
            },
            select: { id: true },
          });

          if (!existingEvent) {
            await tx.verificationEvent.create({
              data: {
                giftCardId: row.cardId,
                result: VerificationResult.PASSED,
                url: row.expectedOfficialUrl,
                notes:
                  "Verification Enrichment v19: HTTP 2xx; same merchant domain; " +
                  "strong gift-card semantics and commerce/value evidence.",
                checkedAt: new Date(),
              },
            });
            e++;
          }
        }

        return { u, s, e };
      },
      { maxWait: 20_000, timeout: 60_000 },
    );

    updatedCards += result.u;
    createdSources += result.s;
    createdEvents += result.e;

    console.log(
      `Batch ${bi + 1}/${batches.length}: verified=${result.u}, sources=${result.s}, events=${result.e}`,
    );
  }

  const report = {
    version: VERSION,
    mode: "APPLY",
    planId: saved.planId,
    appliedAt: new Date().toISOString(),
    plannedAutoSafe: saved.safe.length,
    stableAutoSafe: stableSafe.length,
    skippedDrift: skippedDrift.map((row) => ({
      cardId: row.cardId,
      merchantName: row.merchantName,
      bucket: row.bucket,
      reason: row.reason,
    })),
    updatedCards,
    createdSources,
    createdEvents,
  };

  fs.writeFileSync(APPLY_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("=========================================");
  console.log(`Planned AUTO_SAFE: ${saved.safe.length}`);
  console.log(`Stable AUTO_SAFE applied: ${stableSafe.length}`);
  console.log(`Skipped live drift: ${skippedDrift.length}`);
  console.log(`Cards VERIFIED: ${updatedCards}`);
  console.log(`OFFICIAL sources created: ${createdSources}`);
  console.log(`Verification events created: ${createdEvents}`);
  console.log(`JSON: ${APPLY_JSON}`);
}

async function postAudit() {
  const remaining = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      verificationStatus: VerificationStatus.NEEDS_REVIEW,
    },
  });

  const missingCardSource = await prisma.giftCard.count({
    where: {
      status: "ACTIVE",
      sources: {
        none: {
          sourceType: SourceType.OFFICIAL,
          active: true,
        },
      },
    },
  });

  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    activeNeedsReview: remaining,
    activeCardsMissingOfficialSource: missingCardSource,
  };

  fs.writeFileSync(POST_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("Dorokartes Verification Enrichment v19 — POST-AUDIT");
  console.log(`ACTIVE NEEDS_REVIEW: ${remaining}`);
  console.log(`Active cards missing OFFICIAL source: ${missingCardSource}`);
  console.log(`JSON: ${POST_JSON}`);
  console.log("POST-AUDIT ONLY — database unchanged.");
}

async function main() {
  if (APPLY && POST_AUDIT) {
    throw new Error("--apply and --post-audit cannot be combined.");
  }

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
