import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = 2 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID = process.argv.find((arg) => arg.startsWith("--plan-id="))?.slice("--plan-id=".length);
const MERCHANT_IDS = process.argv
  .filter((arg) => arg.startsWith("--merchant-id="))
  .map((arg) => arg.slice("--merchant-id=".length));
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_PATH = path.join(REPORT_DIR, "merchant-logo-revoke-v2-plan.json");
const APPLY_PATH = path.join(REPORT_DIR, "merchant-logo-revoke-v2-apply.json");
const AUDIT_PATH = path.join(REPORT_DIR, "merchant-logo-revoke-v2-post-audit.json");
const PUBLIC_LOGO_DIR = path.resolve(process.cwd(), "public", "merchant-logos");

type RevokeAction = {
  merchantId: string;
  merchantName: string;
  logoUrl: string;
  logoSourceUrl: string | null;
  fileHash: string;
  mediaAssetIds: string[];
};

type RevokePlan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  actions: RevokeAction[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicPath(logoUrl: string) {
  const resolved = path.resolve(process.cwd(), "public", logoUrl.replace(/^\/+/, ""));
  if (!resolved.startsWith(`${PUBLIC_LOGO_DIR}${path.sep}`)) {
    throw new Error(`Refusing non-logo path: ${resolved}`);
  }
  return resolved;
}

function readPlan() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as RevokePlan;
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  void _generatedAt;
  void _planId;
  if (stableHash(material) !== plan.planId) throw new Error("Stored revoke plan ID is invalid.");
  if (!PLAN_ID || PLAN_ID !== plan.planId) throw new Error("Apply/audit requires the exact --plan-id.");
  return plan;
}

async function preview() {
  if (!MERCHANT_IDS.length) throw new Error("Preview requires at least one --merchant-id.");
  const merchants = await prisma.merchant.findMany({
    where: { id: { in: MERCHANT_IDS } },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      logoSourceUrl: true,
      mediaAssets: {
        where: { isPrimary: true, usageStatus: "APPROVED" },
        select: { id: true, url: true, sourceUrl: true },
      },
    },
  });
  if (merchants.length !== new Set(MERCHANT_IDS).size) throw new Error("One or more merchants were not found.");
  const actions = merchants
    .map((merchant): RevokeAction => {
      if (!merchant.logoUrl) throw new Error(`${merchant.name}: logoUrl is already empty.`);
      const file = publicPath(merchant.logoUrl);
      if (!fs.existsSync(file)) throw new Error(`${merchant.name}: public logo file is missing.`);
      const mediaAssetIds = merchant.mediaAssets
        .filter(
          (asset) =>
            asset.url === merchant.logoUrl && asset.sourceUrl === merchant.logoSourceUrl,
        )
        .map((asset) => asset.id)
        .sort();
      if (!mediaAssetIds.length) throw new Error(`${merchant.name}: matching primary MediaAsset is missing.`);
      return {
        merchantId: merchant.id,
        merchantName: merchant.name,
        logoUrl: merchant.logoUrl,
        logoSourceUrl: merchant.logoSourceUrl,
        fileHash: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        mediaAssetIds,
      };
    })
    .sort((a, b) => a.merchantId.localeCompare(b.merchantId));
  const material = { version: VERSION, mode: "PREVIEW" as const, actions };
  const plan: RevokePlan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(material),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-logo-revoke-v2-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  return plan;
}

async function apply(plan: RevokePlan) {
  const quarantineDir = path.join(REPORT_DIR, "revoked-merchant-logos", plan.planId.slice(0, 16));
  fs.mkdirSync(quarantineDir, { recursive: true });
  const moved: Array<{ from: string; to: string }> = [];
  try {
    for (const action of plan.actions) {
      const current = await prisma.merchant.findUnique({
        where: { id: action.merchantId },
        select: { logoUrl: true, logoSourceUrl: true },
      });
      if (current?.logoUrl !== action.logoUrl || current.logoSourceUrl !== action.logoSourceUrl) {
        throw new Error(`${action.merchantName}: merchant logo state changed after preview.`);
      }
      const from = publicPath(action.logoUrl);
      const hash = crypto.createHash("sha256").update(fs.readFileSync(from)).digest("hex");
      if (hash !== action.fileHash) throw new Error(`${action.merchantName}: logo file hash changed.`);
      const references = await prisma.merchant.count({ where: { logoUrl: action.logoUrl } });
      if (references !== 1) throw new Error(`${action.merchantName}: logo file has ${references} references.`);
      const to = path.join(quarantineDir, path.basename(from));
      fs.renameSync(from, to);
      moved.push({ from, to });
    }

    await prisma.$transaction(async (tx) => {
      for (const action of plan.actions) {
        const merchant = await tx.merchant.updateMany({
          where: {
            id: action.merchantId,
            logoUrl: action.logoUrl,
            logoSourceUrl: action.logoSourceUrl,
          },
          data: { logoUrl: null, logoSourceUrl: null },
        });
        if (merchant.count !== 1) throw new Error(`${action.merchantName}: merchant precondition failed.`);
        const assets = await tx.mediaAsset.updateMany({
          where: { id: { in: action.mediaAssetIds }, isPrimary: true, usageStatus: "APPROVED" },
          data: { isPrimary: false, usageStatus: "DO_NOT_USE" },
        });
        if (assets.count !== action.mediaAssetIds.length) {
          throw new Error(`${action.merchantName}: MediaAsset precondition failed.`);
        }
      }
    });
  } catch (error) {
    for (const file of moved.reverse()) {
      if (fs.existsSync(file.to) && !fs.existsSync(file.from)) fs.renameSync(file.to, file.from);
    }
    throw error;
  }
  const report = { version: VERSION, mode: "APPLY", planId: plan.planId, appliedAt: new Date().toISOString(), moved };
  fs.writeFileSync(APPLY_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-logo-revoke-v2-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function postAudit(plan: RevokePlan) {
  const quarantineDir = path.join(REPORT_DIR, "revoked-merchant-logos", plan.planId.slice(0, 16));
  const results = [];
  for (const action of plan.actions) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: action.merchantId },
      select: { logoUrl: true, logoSourceUrl: true },
    });
    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: action.mediaAssetIds } },
      select: { isPrimary: true, usageStatus: true },
    });
    const quarantined = path.join(quarantineDir, path.basename(publicPath(action.logoUrl)));
    const quarantineHash = fs.existsSync(quarantined)
      ? crypto.createHash("sha256").update(fs.readFileSync(quarantined)).digest("hex")
      : null;
    const passed = Boolean(
      merchant &&
        merchant.logoUrl === null &&
        merchant.logoSourceUrl === null &&
        !fs.existsSync(publicPath(action.logoUrl)) &&
        quarantineHash === action.fileHash &&
        assets.length === action.mediaAssetIds.length &&
        assets.every((asset) => !asset.isPrimary && asset.usageStatus === "DO_NOT_USE"),
    );
    results.push({ merchantId: action.merchantId, merchantName: action.merchantName, passed, quarantineHash });
  }
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    planId: plan.planId,
    generatedAt: new Date().toISOString(),
    checked: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results,
  };
  fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-logo-revoke-v2-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (report.failed) throw new Error(`Revoke post-audit failed for ${report.failed} action(s).`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) {
    const plan = readPlan();
    const report = await apply(plan);
    console.log(`Revoked: ${report.moved.length}`);
    console.log(`Plan ID: ${plan.planId}`);
    return;
  }
  if (POST_AUDIT) {
    const plan = readPlan();
    const report = await postAudit(plan);
    console.log(`Checked: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    return;
  }
  const plan = await preview();
  console.log("Dorokartes Merchant Logo Revoke v2 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Actions: ${plan.actions.length}`);
  console.log("PREVIEW ONLY — no assets or database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
