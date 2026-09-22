import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VERSION = 17 as const;
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "master-reconciliation-v17");
const PLAN_JSON = path.join(REPORT_DIR, "master-catalog-reconciliation-v17-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "master-catalog-reconciliation-v17-plan.csv");
const PLAN_MD = path.join(REPORT_DIR, "master-catalog-reconciliation-v17-report.md");
const APPLY_LOG = path.join(REPORT_DIR, "master-catalog-reconciliation-v17-apply.json");
const POST_JSON = path.join(REPORT_DIR, "master-catalog-reconciliation-v17-post-audit.json");

const APPLY = process.argv.includes("--apply");
const SKIP_NETWORK = process.argv.includes("--skip-network");
const EXPECTED_PLAN_ARG = process.argv.find((x) => x.startsWith("--plan-id="));
const EXPECTED_PLAN_ID = EXPECTED_PLAN_ARG?.slice("--plan-id=".length) || null;

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file: string) {
  return fs.existsSync(path.join(ROOT, file));
}

function newestJson(dir: string, prefix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const rows = fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => ({ file: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return rows[0]?.file || null;
}

function runTs(label: string, script: string, args: string[] = [], optional = false) {
  const abs = path.join(ROOT, script);
  if (!fs.existsSync(abs)) {
    if (optional) {
      console.log(`[SKIP] ${label}: ${script} not found`);
      return { ok: false, skipped: true, stdout: "", stderr: "" };
    }
    throw new Error(`Required script not found: ${script}`);
  }
  console.log(`\n=== ${label} ===`);
  const cmd = `npx tsx "${script}" ${args.map((a) => `"${a}"`).join(" ")}`.trim();
  const result = spawnSync(cmd, {
    cwd: ROOT,
    env: process.env,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const ok = result.status === 0;
  if (!ok && !optional) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return { ok, skipped: false, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type MasterBucket = {
  priority: "P0" | "P1" | "P2" | "P3" | "INFO";
  disposition: "AUTO_SAFE" | "KEEP_AS_IS" | "REVIEW" | "ERROR" | "BACKLOG";
  code: string;
  count: number;
  note: string;
};

type SourceRef = { name: string; path: string | null; hash: string | null };

function sourceRef(name: string, file: string | null): SourceRef {
  if (!file || !fs.existsSync(file)) return { name, path: file, hash: null };
  return {
    name,
    path: path.relative(ROOT, file).replace(/\\/g, "/"),
    hash: stableHash(fs.readFileSync(file, "utf8")),
  };
}

function runAudits() {
  ensureDir(REPORT_DIR);

  runTs("Catalog Quality v10", "scripts/audit/catalog-quality-audit-v10.ts");
  runTs("Merchant Identity v1", "scripts/audit/merchant-identity-audit-v1.ts", [], true);
  runTs("Full Catalog Cleanup v11 PLAN", "scripts/pipeline/admin/cleanup-full-catalog-v11.ts");
  runTs("Full Catalog Cleanup v11 ACTIVE POST-AUDIT", "scripts/pipeline/admin/cleanup-full-catalog-v11.ts", ["--post-audit", "--active-only"]);
  runTs("Denomination Groups v2", "scripts/pipeline/admin/audit-denomination-groups-v2.ts", [], true);
  runTs("Denomination Diagnostic v3", "scripts/pipeline/admin/diagnose-denomination-data-v3.ts", [], true);
  if (!SKIP_NETWORK) {
    runTs("Denomination Evidence v1", "scripts/pipeline/admin/harvest-denomination-evidence-v1.ts", [], true);
  } else {
    console.log("\n[SKIP] Denomination Evidence v1: --skip-network");
  }
  runTs("Merchant Logo Audit v2", "scripts/pipeline/admin/audit-merchant-logos-v2.ts", [], true);
}

function collectPlan() {
  const qualityFile = newestJson(path.join(ROOT, "reports", "catalog-audit"), "catalog-quality-audit-v10-");
  const identityFile = newestJson(path.join(ROOT, "reports", "merchant-identity-audit"), "merchant-identity-audit-v1-");
  const v11PlanFile = path.join(ROOT, "reports", "full-catalog-cleanup-v11-plan.json");
  const v11ActiveFile = path.join(ROOT, "reports", "full-catalog-cleanup-v11-active-post-audit.json");
  const denomGroupsFile = path.join(ROOT, "reports", "denomination-consolidation-audit-v2.json");
  const denomEvidenceFile = path.join(ROOT, "reports", "denomination-evidence-v1-preview.json");
  const logoFile = newestJson(path.join(ROOT, "reports"), "merchant-logo-audit-v2-");

  if (!qualityFile) throw new Error("Current catalog quality report was not produced.");
  if (!fs.existsSync(v11PlanFile)) throw new Error("Current v11 plan was not produced.");
  if (!fs.existsSync(v11ActiveFile)) throw new Error("Current v11 active post-audit was not produced.");

  const quality = readJson<any>(qualityFile);
  const v11Plan = readJson<any>(v11PlanFile);
  const v11Active = readJson<any>(v11ActiveFile);
  const identity = identityFile ? readJson<any>(identityFile) : null;
  const denomGroups = fs.existsSync(denomGroupsFile) ? readJson<any>(denomGroupsFile) : null;
  const denomEvidence = fs.existsSync(denomEvidenceFile) ? readJson<any>(denomEvidenceFile) : null;
  const logo = logoFile ? readJson<any>(logoFile) : null;

  const counts: Record<string, number> = quality?.summary?.issueCountsByCode || {};
  const buckets: MasterBucket[] = [];
  const add = (priority: MasterBucket["priority"], disposition: MasterBucket["disposition"], code: string, count: number, note: string) => {
    if (count > 0) buckets.push({ priority, disposition, code, count, note });
  };

  // P0/P1: structural integrity and correctness.
  add("P0", v11Plan?.summary?.actions ? "AUTO_SAFE" : "KEEP_AS_IS", "V11_GUARDED_ACTIONS", Number(v11Plan?.summary?.actions || 0),
      "Delegated to the mature v11 engine. These are the only writes master --apply may execute automatically.");
  add("P0", "REVIEW", "V11_REVIEW_CARDS", Number(v11Active?.summary?.cardsWithReview || 0),
      "Identity/title/denomination review items deliberately withheld by v11 safety rules.");
  add("P0", "REVIEW", "DUPLICATE_OR_DOMAIN_MISMATCH", Number(counts.DUPLICATE_OFFICIAL_URL || 0) + Number(counts.DUPLICATE_CARD_TITLE_SAME_MERCHANT || 0) + Number(counts.OFFICIAL_URL_DOMAIN_MISMATCH || 0),
      "Requires canonical-program verification; never auto-merged by the master layer.");
  add("P1", "BACKLOG", "ACTIVE_CARD_NOT_VERIFIED", Number(counts.ACTIVE_CARD_NOT_VERIFIED || 0),
      "Verification evidence gap. Prioritize before cosmetic SEO work.");
  add("P1", "BACKLOG", "NO_OFFICIAL_CARD_SOURCE", Number(counts.NO_OFFICIAL_CARD_SOURCE || 0),
      "Active card lacks active OFFICIAL SourceRecord.");
  add("P1", "BACKLOG", "NO_OFFICIAL_MERCHANT_SOURCE", Number(counts.NO_OFFICIAL_MERCHANT_SOURCE || 0),
      "Merchant lacks active OFFICIAL source evidence.");
  add("P1", "BACKLOG", "NO_ACTIVE_VARIANT", Number(counts.NO_ACTIVE_VARIANT || 0),
      "Variant structure absent. Must be evidence-backed; title amounts alone are not sufficient.");
  add("P1", "BACKLOG", "NO_OCCASION", Number(counts.NO_OCCASION || 0),
      "Catalog taxonomy/occasion coverage gap.");
  add("P1", "ERROR", "LATEST_SNAPSHOT_BAD_HTTP", Number(counts.LATEST_SNAPSHOT_BAD_HTTP || 0),
      "Needs live/browser verification; HTTP errors never trigger blind URL replacement.");

  // Denomination current evidence.
  if (denomEvidence?.summary) {
    add("P1", "AUTO_SAFE", "DENOM_SAFE_VALUE_EVIDENCE", Number(denomEvidence.summary.safeValueEvidence || 0),
        "Evidence harvester says value/currency/delivery are all safe. Master still does not create variants directly; separate guarded remediator required.");
    add("P1", "KEEP_AS_IS", "DENOM_SUPPORTED_AS_IS", Number(denomEvidence.summary.supportedAsIs || 0),
        "Official page supports card/value identity but not enough evidence for automatic variant creation.");
    add("P1", "REVIEW", "DENOM_REVIEW", Number(denomEvidence.summary.review || 0),
        "Insufficient or conflicting live evidence.");
    add("P1", "ERROR", "DENOM_ERROR", Number(denomEvidence.summary.error || 0),
        "Fetch/HTTP failures; require browser/manual verification.");
  }

  // Asset and SEO layers.
  add("P2", "BACKLOG", "LOGO_MISSING", Number(counts.LOGO_MISSING || 0), "Canonical local merchant logo missing.");
  add("P2", "REVIEW", "LOGO_SOURCE_DOMAIN_MISMATCH", Number(counts.LOGO_SOURCE_DOMAIN_MISMATCH || 0), "Logo source host differs from merchant host; verify provenance before replacement.");
  add("P3", "BACKLOG", "MISSING_SEO_TITLE", Number(counts.MISSING_SEO_TITLE || 0), "SEO metadata gap; safe to address after catalog identity/source correctness.");
  add("P3", "BACKLOG", "MISSING_META_DESCRIPTION", Number(counts.MISSING_META_DESCRIPTION || 0), "SEO metadata gap; safe to address after catalog identity/source correctness.");
  add("P3", "REVIEW", "VERY_SPECIFIC_OFFICIAL_URL", Number(counts.VERY_SPECIFIC_OFFICIAL_URL || 0), "Specific gift-card URLs are often correct; review, do not root-normalize blindly.");

  const sourceReports = [
    sourceRef("catalog-quality-v10", qualityFile),
    sourceRef("merchant-identity-v1", identityFile),
    sourceRef("full-catalog-cleanup-v11-plan", v11PlanFile),
    sourceRef("full-catalog-cleanup-v11-active-post-audit", v11ActiveFile),
    sourceRef("denomination-groups-v2", fs.existsSync(denomGroupsFile) ? denomGroupsFile : null),
    sourceRef("denomination-evidence-v1", fs.existsSync(denomEvidenceFile) ? denomEvidenceFile : null),
    sourceRef("merchant-logo-audit-v2", logoFile),
  ];

  const generatedAt = new Date().toISOString();
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    catalogFingerprint: v11Plan.catalogFingerprint || v11Active.catalogFingerprint || null,
    v11PlanId: v11Plan.planId || null,
    totals: quality?.summary?.totals || {},
    qualitySeverityCounts: quality?.summary?.issueCountsBySeverity || {},
    qualityIssueCounts: counts,
    core: {
      v11Actions: Number(v11Plan?.summary?.actions || 0),
      v11CardsWithActions: Number(v11Plan?.summary?.cardsWithActions || 0),
      v11CardsWithReview: Number(v11Active?.summary?.cardsWithReview || 0),
      v11CleanUnaffected: Number(v11Active?.summary?.cleanUnaffected || 0),
      denominationGroups: Number(denomGroups?.potentialGroups ?? denomGroups?.groups?.length ?? 0),
      denominationEvidence: denomEvidence?.summary || null,
    },
    sourceReports,
    buckets: buckets.sort((a, b) => a.priority.localeCompare(b.priority) || a.code.localeCompare(b.code)),
    autoSafeDelegates: {
      v11Actions: v11Plan.actions || [],
      denominationSafeFindings: (denomEvidence?.findings || []).filter((x: any) => x.status === "SAFE_VALUE_EVIDENCE"),
    },
    notes: [
      "Master v17 is an orchestration/reconciliation layer. It does not invent business data.",
      "--apply delegates only current v11 guarded actions. Denomination/source/logo/SEO findings remain report-only until a dedicated evidence-backed remediator exists.",
      "No blind slug normalization, duplicate deletion, URL root-normalization, or verification promotion is performed.",
    ],
  };
  // Hash only stable reconciliation material. Timestamps and raw report file hashes are informational
  // and must not make a logically identical plan impossible to apply.
  const planId = stableHash({
    version: material.version,
    catalogFingerprint: material.catalogFingerprint,
    v11PlanId: material.v11PlanId,
    totals: material.totals,
    qualitySeverityCounts: material.qualitySeverityCounts,
    qualityIssueCounts: material.qualityIssueCounts,
    core: material.core,
    buckets: material.buckets,
    autoSafeDelegates: material.autoSafeDelegates,
  });
  return { ...material, generatedAt, planId };
}

function writePlan(plan: any) {
  ensureDir(REPORT_DIR);
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2) + "\n", "utf8");

  const headers = ["priority", "disposition", "code", "count", "note"];
  const lines = [headers.join(",")].concat(plan.buckets.map((b: MasterBucket) =>
    [b.priority, b.disposition, b.code, b.count, b.note].map(csvEscape).join(",")
  ));
  fs.writeFileSync(PLAN_CSV, "\uFEFF" + lines.join("\n") + "\n", "utf8");

  const md: string[] = [];
  md.push(`# Dorokartes Master Catalog Reconciliation v${VERSION}`);
  md.push("");
  md.push(`- Generated: ${plan.generatedAt}`);
  md.push(`- Plan ID: \`${plan.planId}\``);
  md.push(`- Catalog fingerprint: \`${plan.catalogFingerprint || "n/a"}\``);
  md.push(`- Active gift cards: ${plan.totals?.activeGiftCards ?? "n/a"}`);
  md.push(`- Total detected issues: ${plan.totals?.issues ?? "n/a"}`);
  md.push(`- v11 guarded actions: ${plan.core.v11Actions}`);
  md.push(`- v11 review cards: ${plan.core.v11CardsWithReview}`);
  md.push(`- v11 clean/unaffected: ${plan.core.v11CleanUnaffected}`);
  if (plan.core.denominationEvidence) {
    const d = plan.core.denominationEvidence;
    md.push(`- Denomination evidence: safe=${d.safeValueEvidence ?? 0}, supported=${d.supportedAsIs ?? 0}, review=${d.review ?? 0}, error=${d.error ?? 0}`);
  }
  md.push("");
  md.push("| Priority | Disposition | Code | Count | Note |");
  md.push("|---|---|---|---:|---|");
  for (const b of plan.buckets as MasterBucket[]) {
    md.push(`| ${b.priority} | ${b.disposition} | ${b.code} | ${b.count} | ${String(b.note).replace(/\|/g, "\\|")} |`);
  }
  md.push("");
  md.push("## Write policy");
  md.push("");
  for (const note of plan.notes) md.push(`- ${note}`);
  fs.writeFileSync(PLAN_MD, md.join("\n") + "\n", "utf8");
}

function printSummary(plan: any) {
  console.log("\n=========================================");
  console.log("Dorokartes Master Reconciliation v17");
  console.log("=========================================");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Catalog fingerprint: ${plan.catalogFingerprint || "n/a"}`);
  console.log(`Active cards: ${plan.totals?.activeGiftCards ?? "n/a"}`);
  console.log(`Detected issues: ${plan.totals?.issues ?? "n/a"}`);
  console.log(`v11 AUTO_SAFE actions: ${plan.core.v11Actions}`);
  console.log(`v11 review cards: ${plan.core.v11CardsWithReview}`);
  console.log(`v11 clean/unaffected: ${plan.core.v11CleanUnaffected}`);
  if (plan.core.denominationEvidence) {
    const d = plan.core.denominationEvidence;
    console.log(`Denominations: safe=${d.safeValueEvidence || 0} supported=${d.supportedAsIs || 0} review=${d.review || 0} error=${d.error || 0}`);
  }
  console.log(`JSON: ${PLAN_JSON}`);
  console.log(`CSV : ${PLAN_CSV}`);
  console.log(`MD  : ${PLAN_MD}`);
}

function applyCurrentPlan(plan: any) {
  if (!fs.existsSync(PLAN_JSON)) throw new Error("Master plan does not exist. Run without --apply first.");
  const stored = readJson<any>(PLAN_JSON);
  if (EXPECTED_PLAN_ID && EXPECTED_PLAN_ID !== stored.planId) {
    throw new Error(`Requested plan ${EXPECTED_PLAN_ID} does not match stored plan ${stored.planId}.`);
  }
  if (stored.planId !== plan.planId) {
    throw new Error("Catalog/reports changed since the stored master plan. Re-run preview and inspect the new plan before applying.");
  }
  if (stored.catalogFingerprint !== plan.catalogFingerprint) {
    throw new Error("Catalog fingerprint changed. Apply aborted.");
  }

  const actions = Number(plan.core?.v11Actions || 0);
  if (actions === 0) {
    const log = {
      version: VERSION,
      mode: "APPLY",
      generatedAt: new Date().toISOString(),
      planId: plan.planId,
      catalogFingerprint: plan.catalogFingerprint,
      delegatedWrites: 0,
      message: "No AUTO_SAFE delegated actions. Database unchanged.",
    };
    fs.writeFileSync(APPLY_LOG, JSON.stringify(log, null, 2) + "\n", "utf8");
    console.log("\nNo AUTO_SAFE actions. Database unchanged.");
    return;
  }

  const v11PlanId = plan.v11PlanId;
  if (!v11PlanId) throw new Error("v11 plan id missing; cannot delegate apply safely.");
  runTs("APPLY delegated v11 guarded actions", "scripts/pipeline/admin/cleanup-full-catalog-v11.ts", ["--apply", `--plan-id=${v11PlanId}`]);

  const log = {
    version: VERSION,
    mode: "APPLY",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    catalogFingerprintBefore: plan.catalogFingerprint,
    delegatedV11PlanId: v11PlanId,
    delegatedWrites: actions,
  };
  fs.writeFileSync(APPLY_LOG, JSON.stringify(log, null, 2) + "\n", "utf8");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Ensure .env is present or the variable is loaded in the process environment.");
  }

  if (APPLY) {
    // Re-run all read-only checks first, ensuring the stored plan still matches the current catalog.
    if (!fs.existsSync(PLAN_JSON)) throw new Error("Run master v17 in preview mode first; no stored plan found.");
    runAudits();
    const current = collectPlan();
    const stored = readJson<any>(PLAN_JSON);
    if (stored.planId !== current.planId) {
      writePlan(current);
      printSummary(current);
      throw new Error("Master plan changed after fresh pre-apply audit. New plan written; review it before applying.");
    }
    applyCurrentPlan(current);

    // Post-audit is always read-only.
    runAudits();
    const post = collectPlan();
    fs.writeFileSync(POST_JSON, JSON.stringify({ ...post, mode: "POST_AUDIT", sourcePlanId: current.planId }, null, 2) + "\n", "utf8");
    writePlan(post);
    printSummary(post);
    console.log(`Post-audit: ${POST_JSON}`);
    return;
  }

  runAudits();
  const plan = collectPlan();
  writePlan(plan);
  printSummary(plan);
  console.log("\nPREVIEW ONLY — database unchanged.");
  if (plan.core.v11Actions > 0) {
    console.log(`To apply only the guarded AUTO_SAFE delegate actions: npx tsx scripts/audit/master-catalog-reconciliation-v17.ts --apply --plan-id=${plan.planId}`);
  } else {
    console.log("No AUTO_SAFE writes are currently available. Use this master report as the single backlog/reconciliation source.");
  }
}

main().catch((error) => {
  console.error("\nMASTER v17 FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
