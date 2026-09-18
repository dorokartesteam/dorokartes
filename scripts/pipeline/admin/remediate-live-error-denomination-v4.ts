import "dotenv/config";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "../../../lib/prisma";

const VERSION = 4 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID =
  process.argv.find((argument) => argument.startsWith("--plan-id="))?.slice("--plan-id=".length) ||
  null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_REPORT = path.join(
  REPORT_DIR,
  "denomination-evidence-v1-preview-28dc3739f07ea237.json",
);
const SOURCE_REPORT_ID = "28dc3739f07ea2373fa3c3e31ac97de895d10938fa9c24a951a2587f753f5266";
const PLAN_JSON = path.join(REPORT_DIR, "live-error-denomination-remediation-v4-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "live-error-denomination-remediation-v4-plan.csv");
const APPLY_LOG = path.join(REPORT_DIR, "live-error-denomination-remediation-v4-apply.json");
const POST_AUDIT_JSON = path.join(
  REPORT_DIR,
  "live-error-denomination-remediation-v4-post-audit.json",
);
const execFileAsync = promisify(execFile);

type SourceSpecification = {
  url: string;
  assertions: Array<{ label: string; pattern: RegExp }>;
};

type Specification = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  expectedTitle: string;
  titleAfter: string;
  cardSlug: string;
  officialUrlBefore: string;
  officialUrlAfter: string;
  values: string[];
  sources: SourceSpecification[];
  evidence: string[];
};

const SPECIFICATION: Specification = {
  cardId: "cmta1fxm40041q8iyf19nk7km",
  merchantId: "cmta1fxg20040q8iyzetmsdo8",
  merchantName: "iQueens",
  merchantSlug: "iqueens",
  expectedTitle: "iQueens: Το Ιδανικό Δώρο! Δωροκάρτες από 20€ έως 400€",
  titleAfter: "iQueens Gift Card",
  cardSlug: "iqueens-iqueens-το-ιδανικο-δωρο-δωροκαρτες-απο-20-εως-400",
  officialUrlBefore:
    "https://www.iqueens.gr/el/dorokartes/309412-ilektroniko-kouponi-aksias-400-.html",
  officialUrlAfter: "https://www.iqueens.gr/el/9-dorokartes",
  values: ["20", "40", "100", "125", "200", "400"],
  sources: [
    {
      url: "https://www.iqueens.gr/el/dorokartes/309412-ilektroniko-kouponi-aksias-400-.html",
      assertions: [
        {
          label: "€400 electronic-voucher product identity",
          pattern: /Ηλεκτρονικό\s+κουπόνι\s+αξίας\s+400\s*€/iu,
        },
        {
          label: "complete selectable denomination set",
          pattern:
            /Επιλέξτε\s+ένα\s+ποσό\s+20\s*€\s+40\s*€\s+100\s*€\s+125\s*€\s+200\s*€\s+400\s*€/iu,
        },
        {
          label: "email delivery within one hour",
          pattern: /Θα\s+λάβετε\s+το\s+κουπόνι\s+μέσω\s+email\s+εντός\s+1\s+ώρας/iu,
        },
      ],
    },
    {
      url: "https://www.iqueens.gr/el/9-dorokartes",
      assertions: [
        {
          label: "official gift-card category",
          pattern: /Δωροκάρτες\s*\|\s*Τιμή\s+από\s+20\s*€/iu,
        },
        { label: "six gift-card products", pattern: /Προϊόντα\s*:\s*6/iu },
        {
          label: "€400 product listed in category",
          pattern: /Ηλεκτρονικό\s+κουπόνι\s+αξίας\s+400\s*€/iu,
        },
      ],
    },
  ],
  evidence: [
    "The official product page identifies the item as an electronic €400 voucher.",
    "The official product form exposes exactly €20, €40, €100, €125, €200 and €400.",
    "The official product page says the voucher is delivered by email within one hour.",
    "The verified official gift-card category replaces the denomination-specific catalog URL.",
  ],
};

type SourceReport = {
  reportId: string;
  mode: "PREVIEW";
  findings: Array<{
    cardId: string;
    merchantId: string;
    officialUrl: string;
    finalUrl: string | null;
    status: string;
    reasons: string[];
    existingVariantCount: number;
  }>;
};

type LiveEvidence = Array<{
  requestedUrl: string;
  finalUrl: string;
  checks: Array<{ label: string; matched: string }>;
}>;

type TargetState = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;

type Action =
  | {
      type: "UPDATE_CARD_TITLE";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      expectedUpdatedAt: string;
      evidence: string[];
    }
  | {
      type: "UPDATE_OFFICIAL_URL";
      actionId: string;
      cardId: string;
      merchantId: string;
      expected: string;
      value: string;
      evidence: string[];
    }
  | {
      type: "CREATE_VARIANT";
      actionId: string;
      cardId: string;
      merchantId: string;
      expectedTitleAfter: string;
      officialUrlAfter: string;
      values: string[];
      deliveryMethods: ["EMAIL"];
      evidence: string[];
    };

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  sourceReportId: string;
  targetFingerprint: string;
  liveEvidenceFingerprint: string;
  planId: string;
  cardCount: number;
  actionCount: number;
  liveEvidence: LiveEvidence;
  actions: Action[];
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function decimal(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function decodeHtml(text: string) {
  const named: Record<string, string> = {
    alpha: "α",
    amp: "&",
    apos: "'",
    beta: "β",
    chi: "χ",
    delta: "δ",
    epsilon: "ε",
    eta: "η",
    euro: "€",
    gamma: "γ",
    gt: ">",
    iota: "ι",
    kappa: "κ",
    lambda: "λ",
    lt: "<",
    mu: "μ",
    nbsp: " ",
    nu: "ν",
    omega: "ω",
    omicron: "ο",
    phi: "φ",
    pi: "π",
    psi: "ψ",
    quot: '"',
    rho: "ρ",
    sigma: "σ",
    sigmaf: "ς",
    tau: "τ",
    theta: "θ",
    upsilon: "υ",
    xi: "ξ",
    zeta: "ζ",
  };
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&([a-z]+);/giu, (entity, name: string) => {
      const decoded = named[name.toLowerCase()];
      if (!decoded) return entity;
      return name[0] === name[0]?.toUpperCase() && /[α-ω]/u.test(decoded)
        ? decoded.toUpperCase()
        : decoded;
    });
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
}

function canonicalPageKey(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/u, "") || "/";
  return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
}

async function inspectSource(source: SourceSpecification) {
  const marker = "__DOROKARTES_CURL_META_4D7470B3__";
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(
    curl,
    [
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "30",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "--header",
      "Accept: text/html,application/xhtml+xml",
      "--header",
      "Accept-Language: el-GR,el;q=0.9,en;q=0.8",
      "--header",
      "Cache-Control: no-cache",
      "--write-out",
      `\n${marker}\t%{http_code}\t%{url_effective}`,
      source.url,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 35_000 },
  );
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing curl response metadata: ${source.url}`);
  const html = stdout.slice(0, markerIndex).trimEnd();
  const [statusText, finalUrl] = stdout
    .slice(markerIndex + marker.length)
    .trim()
    .split("\t");
  const status = Number(statusText);
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new Error(`Official source returned HTTP ${statusText}: ${source.url}`);
  }
  if (!finalUrl || canonicalPageKey(finalUrl) !== canonicalPageKey(source.url)) {
    throw new Error(`Official source redirected away from its approved page: ${source.url}`);
  }
  const text = htmlToText(html);
  const checks = source.assertions.map((assertion) => {
    const matched = text.match(assertion.pattern)?.[0];
    if (!matched) throw new Error(`Missing live evidence "${assertion.label}": ${source.url}`);
    return { label: assertion.label, matched: matched.replace(/\s+/gu, " ").trim() };
  });
  return { requestedUrl: source.url, finalUrl, transport: "curl", checks };
}

async function collectLiveEvidence(): Promise<LiveEvidence> {
  return Promise.all(SPECIFICATION.sources.map(inspectSource));
}

async function loadTarget() {
  return prisma.giftCard.findUnique({
    where: { id: SPECIFICATION.cardId },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      updatedAt: true,
      merchant: { select: { name: true, slug: true, updatedAt: true } },
      variants: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          purchaseUrl: true,
          validityMonths: true,
          active: true,
          values: { orderBy: { value: "asc" }, select: { value: true } },
          deliveries: { orderBy: { method: "asc" }, select: { method: true } },
          redemptions: { orderBy: { channel: "asc" }, select: { channel: true } },
        },
      },
    },
  });
}

function targetSnapshot(card: TargetState) {
  return {
    id: card.id,
    merchantId: card.merchantId,
    merchantName: card.merchant.name,
    merchantSlug: card.merchant.slug,
    merchantUpdatedAt: card.merchant.updatedAt.toISOString(),
    title: card.title,
    slug: card.slug,
    officialUrl: card.officialUrl,
    status: card.status,
    updatedAt: card.updatedAt.toISOString(),
    variants: card.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      type: variant.type,
      currency: variant.currency,
      minValue: decimal(variant.minValue),
      maxValue: decimal(variant.maxValue),
      customValueAllowed: variant.customValueAllowed,
      purchaseUrl: variant.purchaseUrl,
      validityMonths: variant.validityMonths,
      active: variant.active,
      values: variant.values.map((item) => decimal(item.value)),
      deliveries: variant.deliveries.map((item) => item.method),
      redemptions: variant.redemptions.map((item) => item.channel),
    })),
  };
}

function fingerprint(card: TargetState) {
  return stableHash(targetSnapshot(card));
}

function assertSourceReport(source: SourceReport) {
  if (source.mode !== "PREVIEW" || source.reportId !== SOURCE_REPORT_ID) {
    throw new Error("The immutable denomination report does not match the approved source.");
  }
  const finding = source.findings.find((item) => item.cardId === SPECIFICATION.cardId);
  if (
    !finding ||
    finding.merchantId !== SPECIFICATION.merchantId ||
    finding.officialUrl !== SPECIFICATION.officialUrlBefore ||
    finding.finalUrl !== null ||
    finding.status !== "ERROR" ||
    !finding.reasons.includes("PAGE_HTTP_400") ||
    finding.existingVariantCount !== 0
  ) {
    throw new Error("Evidence-report precondition failed for the iQueens target.");
  }
}

function specificationComplete(card: TargetState) {
  const variant = card.variants[0];
  const expectedValues = SPECIFICATION.values.map(Number).sort((left, right) => left - right);
  const actualValues =
    variant?.values.map((item) => Number(String(item.value))).sort((left, right) => left - right) || [];
  return Boolean(
    card.merchantId === SPECIFICATION.merchantId &&
      card.merchant.name === SPECIFICATION.merchantName &&
      card.merchant.slug === SPECIFICATION.merchantSlug &&
      card.title === SPECIFICATION.titleAfter &&
      card.slug === SPECIFICATION.cardSlug &&
      card.officialUrl === SPECIFICATION.officialUrlAfter &&
      card.status === "ACTIVE" &&
      card.variants.length === 1 &&
      variant?.name === "Digital" &&
      variant.type === "DIGITAL" &&
      variant.currency === "EUR" &&
      decimal(variant.minValue) === "20" &&
      decimal(variant.maxValue) === "400" &&
      !variant.customValueAllowed &&
      variant.purchaseUrl === SPECIFICATION.officialUrlAfter &&
      variant.validityMonths === null &&
      variant.active &&
      JSON.stringify(actualValues) === JSON.stringify(expectedValues) &&
      JSON.stringify(variant.deliveries.map((item) => item.method)) === JSON.stringify(["EMAIL"]) &&
      variant.redemptions.length === 0
  );
}

function assertPendingPreconditions(card: TargetState) {
  if (
    card.merchantId !== SPECIFICATION.merchantId ||
    card.merchant.name !== SPECIFICATION.merchantName ||
    card.merchant.slug !== SPECIFICATION.merchantSlug ||
    card.title !== SPECIFICATION.expectedTitle ||
    card.slug !== SPECIFICATION.cardSlug ||
    card.officialUrl !== SPECIFICATION.officialUrlBefore ||
    card.status !== "ACTIVE" ||
    card.variants.length !== 0
  ) {
    throw new Error("Catalog precondition failed for the iQueens target.");
  }
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = [
    "type",
    "actionId",
    "cardId",
    "merchantId",
    "expected",
    "value",
    "values",
    "deliveryMethods",
    "evidence",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) => {
      const row: Record<string, unknown> = { ...action };
      return headers.map((header) => csvEscape(row[header])).join(",");
    }),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(source: SourceReport): Promise<Plan> {
  assertSourceReport(source);
  const [card, liveEvidence] = await Promise.all([loadTarget(), collectLiveEvidence()]);
  if (!card) throw new Error("The iQueens target is missing.");
  const complete = specificationComplete(card);
  if (!complete) assertPendingPreconditions(card);
  const actions: Action[] = complete
    ? []
    : [
        {
          type: "UPDATE_CARD_TITLE",
          actionId: `update-title:${SPECIFICATION.cardId}`,
          cardId: SPECIFICATION.cardId,
          merchantId: SPECIFICATION.merchantId,
          expected: SPECIFICATION.expectedTitle,
          value: SPECIFICATION.titleAfter,
          expectedUpdatedAt: card.updatedAt.toISOString(),
          evidence: SPECIFICATION.evidence,
        },
        {
          type: "UPDATE_OFFICIAL_URL",
          actionId: `update-official-url:${SPECIFICATION.cardId}`,
          cardId: SPECIFICATION.cardId,
          merchantId: SPECIFICATION.merchantId,
          expected: SPECIFICATION.officialUrlBefore,
          value: SPECIFICATION.officialUrlAfter,
          evidence: SPECIFICATION.evidence,
        },
        {
          type: "CREATE_VARIANT",
          actionId: `create-digital-variant:${SPECIFICATION.cardId}`,
          cardId: SPECIFICATION.cardId,
          merchantId: SPECIFICATION.merchantId,
          expectedTitleAfter: SPECIFICATION.titleAfter,
          officialUrlAfter: SPECIFICATION.officialUrlAfter,
          values: SPECIFICATION.values,
          deliveryMethods: ["EMAIL"],
          evidence: SPECIFICATION.evidence,
        },
      ];
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    sourceReportId: source.reportId,
    targetFingerprint: fingerprint(card),
    liveEvidenceFingerprint: stableHash(liveEvidence),
    cardCount: complete ? 0 : 1,
    actionCount: actions.length,
    liveEvidence,
    actions,
  };
  return { ...material, generatedAt: new Date().toISOString(), planId: stableHash(material) };
}

function assertPlanRequest(plan: Plan) {
  if (plan.version !== VERSION) throw new Error("Stored plan version does not match this script.");
  if (!REQUESTED_PLAN_ID) throw new Error("This operation requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Requested plan ID does not match the stored preview.");
  }
}

async function applyPlan(plan: Plan, source: SourceReport) {
  assertPlanRequest(plan);
  assertSourceReport(source);
  const [card, liveEvidence] = await Promise.all([loadTarget(), collectLiveEvidence()]);
  if (!card || fingerprint(card) !== plan.targetFingerprint) {
    throw new Error("Target state changed after preview; refusing to apply.");
  }
  if (stableHash(liveEvidence) !== plan.liveEvidenceFingerprint) {
    throw new Error("Live official-page evidence changed after preview; refusing to apply.");
  }
  const applied: Array<Record<string, unknown>> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        if (action.type === "UPDATE_CARD_TITLE") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: action.expected,
              slug: SPECIFICATION.cardSlug,
              officialUrl: SPECIFICATION.officialUrlBefore,
              status: "ACTIVE",
              updatedAt: new Date(action.expectedUpdatedAt),
            },
            data: { title: action.value },
          });
          if (result.count !== 1) throw new Error("Title precondition failed for iQueens.");
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
          continue;
        }
        if (action.type === "UPDATE_OFFICIAL_URL") {
          const result = await tx.giftCard.updateMany({
            where: {
              id: action.cardId,
              merchantId: action.merchantId,
              title: SPECIFICATION.titleAfter,
              slug: SPECIFICATION.cardSlug,
              officialUrl: action.expected,
              status: "ACTIVE",
            },
            data: { officialUrl: action.value },
          });
          if (result.count !== 1) throw new Error("URL precondition failed for iQueens.");
          applied.push({ actionId: action.actionId, from: action.expected, to: action.value });
          continue;
        }
        const current = await tx.giftCard.findUnique({
          where: { id: action.cardId },
          select: {
            merchantId: true,
            title: true,
            slug: true,
            officialUrl: true,
            status: true,
            merchant: { select: { name: true, slug: true } },
          },
        });
        const variantCount = await tx.giftCardVariant.count({ where: { giftCardId: action.cardId } });
        if (
          !current ||
          current.merchantId !== action.merchantId ||
          current.merchant.name !== SPECIFICATION.merchantName ||
          current.merchant.slug !== SPECIFICATION.merchantSlug ||
          current.title !== action.expectedTitleAfter ||
          current.slug !== SPECIFICATION.cardSlug ||
          current.officialUrl !== action.officialUrlAfter ||
          current.status !== "ACTIVE" ||
          variantCount !== 0
        ) {
          throw new Error("Variant precondition failed for iQueens.");
        }
        const values = action.values.map(Number);
        const variant = await tx.giftCardVariant.create({
          data: {
            giftCardId: action.cardId,
            name: "Digital",
            type: "DIGITAL",
            currency: "EUR",
            minValue: String(Math.min(...values)),
            maxValue: String(Math.max(...values)),
            customValueAllowed: false,
            purchaseUrl: action.officialUrlAfter,
            validityMonths: null,
            values: { create: action.values.map((value) => ({ value })) },
            deliveries: { create: action.deliveryMethods.map((method) => ({ method })) },
          },
          select: { id: true },
        });
        applied.push({ actionId: action.actionId, cardId: action.cardId, variantId: variant.id });
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    appliedCount: applied.length,
    applied,
  };
  fs.writeFileSync(APPLY_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function postAudit(plan: Plan) {
  assertPlanRequest(plan);
  const card = await loadTarget();
  const passed = Boolean(card && specificationComplete(card));
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: 1,
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    databaseWrites: 0,
    result: {
      cardId: SPECIFICATION.cardId,
      merchantId: SPECIFICATION.merchantId,
      passed,
      preserved: card
        ? {
            merchantName: card.merchant.name,
            merchantSlug: card.merchant.slug,
            cardSlug: card.slug,
            status: card.status,
          }
        : null,
    },
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!passed) throw new Error("Post-audit failed for the iQueens card.");
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const source = readJson<SourceReport>(SOURCE_REPORT);
  if (APPLY) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await applyPlan(plan, source);
    console.log("Dorokartes Live Error Denomination v4 — APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied actions: ${report.appliedCount}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readJson<Plan>(PLAN_JSON);
    const report = await postAudit(plan);
    console.log("Dorokartes Live Error Denomination v4 — POST-AUDIT");
    console.log(`Checked cards: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await buildPlan(source);
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.actions);
  fs.writeFileSync(
    path.join(REPORT_DIR, `live-error-denomination-remediation-v4-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Live Error Denomination v4 — PREVIEW");
  console.log(`Evidence report: ${plan.sourceReportId}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Cards: ${plan.cardCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  for (const type of ["UPDATE_CARD_TITLE", "UPDATE_OFFICIAL_URL", "CREATE_VARIANT"] as const) {
    console.log(`  ${type}: ${plan.actions.filter((action) => action.type === type).length}`);
  }
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
