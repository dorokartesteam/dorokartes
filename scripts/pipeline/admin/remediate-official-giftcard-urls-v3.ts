import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { prisma } from "../../../lib/prisma";

const VERSION = "official-giftcard-url-remediation-v3" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv
  .find((value) => value.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);

const SPECIFICATIONS = [
  {
    cardId: "cmta1gxm7007gq8iycl9elv83",
    merchantName: "Sportcafe",
    expectedTitle: "eGift Card - SportCafe",
    expectedOfficialUrl: "https://sportcafe.gr/",
    replacementUrl: "https://sportcafe.gr/egift-card/",
    expectedVerificationStatus: "VERIFIED",
    evidenceRule: "H1_AND_PURCHASE_FLOW_CONFIRM_EGIFT_CARD",
  },
  {
    cardId: "cmta1hkhz0098q8iyjadmmr3n",
    merchantName: "Beautylink",
    expectedTitle: "Gift Card Αξίας 50 Ευρώ",
    expectedOfficialUrl: "https://beautylink.gr/",
    replacementUrl:
      "https://www.beautylink.gr/shop/mwb_wgm_giftcard/gift-card-%ce%b1%ce%be%ce%af%ce%b1%cf%82-50-%ce%b5%cf%85%cf%81%cf%8e/",
    expectedVerificationStatus: "VERIFIED",
    evidenceRule: "EXACT_DENOMINATION_TITLE_AND_H1_MATCH",
  },
  {
    cardId: "cmta1m1t900riq8iy2b9sin92",
    merchantName: "Sekoia",
    expectedTitle: "Gift cards",
    expectedOfficialUrl: "https://sekoia.gr/",
    replacementUrl: "https://sekoia.gr/product/gift-card/",
    expectedVerificationStatus: "VERIFIED",
    evidenceRule: "PRODUCT_H1_AND_AMOUNT_SELECTOR_CONFIRM_GIFT_CARD",
  },
  {
    cardId: "cmtb62qlm001r94iy91xv9clz",
    merchantName: "Outdoorshop",
    expectedTitle: "Gift Card - Δωροεπιταγή",
    expectedOfficialUrl:
      "https://outdoorshop.gr/en/shop/%CE%B4%CF%89%CF%81%CE%BF%CE%B5%CF%80%CE%B9%CF%84%CE%B1%CE%B3%CE%AD%CF%82/gift-card-2/",
    replacementUrl: "https://outdoorshop.gr/en/product/doroepitagi/",
    expectedVerificationStatus: "VERIFIED",
    evidenceRule: "SAME_DOMAIN_200_REPLACEMENT_WITH_GIFT_CARD_H1",
  },
] as const;

const HOLDS = [
  {
    cardId: "cmta1fsds003hq8iywvbrxbq7",
    merchantName: "LIAKOPOULOS Brands Store",
    candidateUrl:
      "https://liakopoulos-store.gr/product/ck-jeans-350gsm-fleece-gift-giving-fz-hoo-%ce%bc%ce%b1%cf%85%cf%81%ce%bf/",
    reason: "REJECT_NON_GIFTCARD_APPAREL_PRODUCT",
  },
  {
    cardId: "cmta1kptg00m8q8iyxikg29yq",
    merchantName: "Hlcpro",
    candidateUrl: "https://hlcpro.gr/product/gift-card-expiry-extension/",
    reason: "REJECT_EXPIRY_EXTENSION_UTILITY",
  },
  {
    cardId: "cmta1lwrt00qyq8iy0horqkam",
    merchantName: "Lovefashionpoint",
    candidateUrl: "https://lovefashionpoint.gr/gift-card-balance/",
    reason: "REJECT_BALANCE_CHECKER",
  },
  {
    cardId: "cmta1m0d900rcq8iy7cru4enr",
    merchantName: "Poupee",
    candidateUrl: "https://poupee.gr/gift-card",
    reason: "REVIEW_PAGE_HAS_TITLE_BUT_NO_PRODUCT_OR_PURCHASE_EVIDENCE",
  },
  {
    cardId: "cmta1m4x600ruq8iyic1fo9fb",
    merchantName: "Tresorjewelry",
    candidateUrl: "https://tresorjewelry.gr/gift-cards",
    reason: "REJECT_SOFT_HOMEPAGE_WITH_HOME_CANONICAL",
  },
] as const;

type Specification = (typeof SPECIFICATIONS)[number];
type Evidence = {
  checkedUrl: string;
  finalUrl: string;
  httpStatus: number;
  title: string;
  h1: string;
  mainSnippet: string;
  evidenceRule: Specification["evidenceRule"];
};
type Target = Awaited<ReturnType<typeof loadTargets>>[number];
type Action = {
  actionId: string;
  cardId: string;
  merchantName: string;
  expectedTitle: string;
  expectedOfficialUrl: string;
  replacementUrl: string;
  expectedVerificationStatus: Specification["expectedVerificationStatus"];
  evidence: Evidence;
};
type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  targetFingerprint: string;
  summary: {
    totalGiftCards: number;
    activeGiftCards: number;
    actionCount: number;
    holdCount: number;
  };
  actions: Action[];
  holds: typeof HOLDS;
};

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|gclid|fbclid|msclkid|srsltid)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

function sameMerchantHost(left: string, right: string) {
  const a = new URL(left).hostname.toLowerCase().replace(/^www\./, "");
  const b = new URL(right).hostname.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

async function loadTargets() {
  return prisma.giftCard.findMany({
    where: { id: { in: SPECIFICATIONS.map((item) => item.cardId) } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      merchantId: true,
      merchant: {
        select: {
          name: true,
          websiteUrl: true,
          status: true,
        },
      },
    },
  });
}

function targetMaterial(targets: Target[]) {
  return targets.map((target) => ({
    ...target,
    merchant: { ...target.merchant },
  }));
}

function assertTargets(targets: Target[]) {
  if (targets.length !== SPECIFICATIONS.length) {
    throw new Error(`Expected ${SPECIFICATIONS.length} URL targets, found ${targets.length}.`);
  }
  const byId = new Map(targets.map((target) => [target.id, target]));
  for (const spec of SPECIFICATIONS) {
    const target = byId.get(spec.cardId);
    if (
      !target ||
      target.title !== spec.expectedTitle ||
      target.officialUrl !== spec.expectedOfficialUrl ||
      target.status !== "ACTIVE" ||
      target.verificationStatus !== spec.expectedVerificationStatus ||
      target.merchant.name !== spec.merchantName ||
      target.merchant.status !== "ACTIVE" ||
      !target.merchant.websiteUrl ||
      !sameMerchantHost(spec.replacementUrl, target.merchant.websiteUrl)
    ) {
      throw new Error(`URL target precondition failed: ${spec.cardId}`);
    }
  }
}

function text(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function fetchEvidence(spec: Specification): Promise<Evidence> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(spec.replacementUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DorokartesAudit/3.0; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    $("script,style,noscript,svg").remove();
    const title = text($("title").first().text());
    const h1 = text($("h1").first().text());
    const mainText = text($("main").first().text() || $("body").text());
    const evidenceText = `${title} ${h1} ${mainText.slice(0, 2_000)}`.toLowerCase();
    const hasGiftIdentity =
      /gift\s*card|egift|δωροκαρτ|δωροεπιταγ|doroepitagi/i.test(evidenceText);
    const looksUnavailable =
      /404|not found|account suspended|plesk obsidian|under construction/i.test(
        `${title} ${h1} ${mainText.slice(0, 800)}`,
      );
    if (
      response.status < 200 ||
      response.status >= 300 ||
      canonicalUrl(response.url) !== canonicalUrl(spec.replacementUrl) ||
      !hasGiftIdentity ||
      looksUnavailable
    ) {
      throw new Error(`Replacement evidence failed for ${spec.cardId}.`);
    }
    if (
      spec.cardId === "cmta1hkhz0098q8iyjadmmr3n" &&
      !/50\s*(?:€|ευρ|euro)/i.test(`${spec.expectedTitle} ${title} ${h1}`)
    ) {
      throw new Error("Beautylink denomination evidence does not match the card.");
    }
    return {
      checkedUrl: spec.replacementUrl,
      finalUrl: response.url,
      httpStatus: response.status,
      title,
      h1,
      mainSnippet: mainText.slice(0, 600),
      evidenceRule: spec.evidenceRule,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function material(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan;
  void _generatedAt;
  void _planId;
  if (hash(material(rest)) !== plan.planId) throw new Error("Stored plan hash is invalid.");
  if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Apply/post-audit requires the exact --plan-id from PREVIEW.");
  }
}

function readPlan() {
  if (!fs.existsSync(PLAN_JSON)) throw new Error("Run PREVIEW first.");
  return JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")) as Plan;
}

function csvEscape(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(plan: Plan) {
  const headers = [
    "status",
    "cardId",
    "merchantName",
    "expectedOfficialUrl",
    "replacementUrl",
    "reason",
    "httpStatus",
    "title",
    "h1",
    "actionId",
  ];
  const rows = [
    ...plan.actions.map((action) => ({
      status: "SAFE",
      cardId: action.cardId,
      merchantName: action.merchantName,
      expectedOfficialUrl: action.expectedOfficialUrl,
      replacementUrl: action.replacementUrl,
      reason: action.evidence.evidenceRule,
      httpStatus: action.evidence.httpStatus,
      title: action.evidence.title,
      h1: action.evidence.h1,
      actionId: action.actionId,
    })),
    ...plan.holds.map((hold) => ({
      status: "HOLD",
      cardId: hold.cardId,
      merchantName: hold.merchantName,
      expectedOfficialUrl: "",
      replacementUrl: hold.candidateUrl,
      reason: hold.reason,
      httpStatus: "",
      title: "",
      h1: "",
      actionId: "",
    })),
  ];
  fs.writeFileSync(
    PLAN_CSV,
    `\uFEFF${[headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key as keyof typeof row])).join(","))].join("\n")}\n`,
    "utf8",
  );
}

async function stats() {
  const [totalGiftCards, activeGiftCards] = await Promise.all([
    prisma.giftCard.count(),
    prisma.giftCard.count({ where: { status: "ACTIVE" } }),
  ]);
  return { totalGiftCards, activeGiftCards };
}

async function preview() {
  const targets = await loadTargets();
  assertTargets(targets);
  const [before, evidence] = await Promise.all([
    stats(),
    Promise.all(SPECIFICATIONS.map(fetchEvidence)),
  ]);
  const actions = SPECIFICATIONS.map((spec, index) => {
    const base = {
      cardId: spec.cardId,
      merchantName: spec.merchantName,
      expectedTitle: spec.expectedTitle,
      expectedOfficialUrl: spec.expectedOfficialUrl,
      replacementUrl: spec.replacementUrl,
      expectedVerificationStatus: spec.expectedVerificationStatus,
      evidence: evidence[index],
    };
    return { actionId: hash(base), ...base };
  });
  const base = {
    version: VERSION,
    mode: "PREVIEW" as const,
    targetFingerprint: hash(targetMaterial(targets)),
    summary: {
      ...before,
      actionCount: actions.length,
      holdCount: HOLDS.length,
    },
    actions,
    holds: HOLDS,
  };
  const plan: Plan = {
    ...base,
    generatedAt: new Date().toISOString(),
    planId: hash(material(base)),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(plan);
  console.log("Dorokartes Official Gift-card URL Remediation v3 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Safe URL updates: ${plan.summary.actionCount}`);
  console.log(`HOLD/REJECT: ${plan.summary.holdCount}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function applyPlan() {
  const plan = readPlan();
  verifyPlan(plan);
  const targets = await loadTargets();
  assertTargets(targets);
  if (hash(targetMaterial(targets)) !== plan.targetFingerprint) {
    throw new Error("Target catalog state changed after PREVIEW.");
  }
  const before = await stats();
  if (
    before.totalGiftCards !== plan.summary.totalGiftCards ||
    before.activeGiftCards !== plan.summary.activeGiftCards
  ) {
    throw new Error("Catalog counts changed after PREVIEW.");
  }
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        const result = await tx.giftCard.updateMany({
          where: {
            id: action.cardId,
            title: action.expectedTitle,
            officialUrl: action.expectedOfficialUrl,
            status: "ACTIVE",
            verificationStatus: action.expectedVerificationStatus,
            merchant: { name: action.merchantName, status: "ACTIVE" },
          },
          data: { officialUrl: action.replacementUrl },
        });
        if (result.count !== 1) {
          throw new Error(`URL update precondition failed: ${action.cardId}`);
        }
      }
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const after = await stats();
  if (
    after.totalGiftCards !== before.totalGiftCards ||
    after.activeGiftCards !== before.activeGiftCards
  ) {
    throw new Error("Post-apply catalog count invariant failed.");
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
  console.log(`APPLY ${report.applied}: official URLs updated; gift cards preserved ${after.totalGiftCards}.`);
}

async function postAudit() {
  const plan = readPlan();
  verifyPlan(plan);
  if (!fs.existsSync(APPLY_JSON)) throw new Error("Apply report is missing.");
  const applyReport = JSON.parse(fs.readFileSync(APPLY_JSON, "utf8")) as {
    planId: string;
    applied: number;
    before: Awaited<ReturnType<typeof stats>>;
    after: Awaited<ReturnType<typeof stats>>;
  };
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Apply report does not match the requested plan.");
  }
  const rows = await prisma.giftCard.findMany({
    where: { id: { in: plan.actions.map((action) => action.cardId) } },
    select: {
      id: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      merchant: { select: { name: true, status: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const failed = plan.actions.filter((action) => {
    const row = byId.get(action.cardId);
    return (
      !row ||
      row.title !== action.expectedTitle ||
      row.officialUrl !== action.replacementUrl ||
      row.status !== "ACTIVE" ||
      row.verificationStatus !== action.expectedVerificationStatus ||
      row.merchant.name !== action.merchantName ||
      row.merchant.status !== "ACTIVE"
    );
  });
  const current = await stats();
  const invariants = {
    totalGiftCardsPreserved: current.totalGiftCards === applyReport.before.totalGiftCards,
    activeGiftCardsPreserved: current.activeGiftCards === applyReport.before.activeGiftCards,
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
    throw new Error("URL remediation post-audit failed.");
  }
  console.log(`POST-AUDIT ${report.passed}/${report.checked}; gift cards preserved: ${current.totalGiftCards}`);
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
