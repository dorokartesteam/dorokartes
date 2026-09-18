import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = "location-import-v1";
const EVIDENCE_VERSION = "location-evidence-v1";
const REPORT_DIR = path.join(process.cwd(), "reports");
const EVIDENCE_JSON = path.join(REPORT_DIR, `${EVIDENCE_VERSION}.json`);
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="))?.split("=")[1];

type EvidenceCandidate = {
  merchantId: string;
  merchantName: string;
  giftCardId: string;
  sourceUrl: string;
  extractionMethod: "JSON_LD" | "MICRODATA";
  schemaTypes: string[];
  label: string | null;
  streetAddress: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  postalCode: string | null;
  addressCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  normalizedKey: string | null;
  bucket: "SAFE" | "REVIEW";
  reason: string;
  sourceExcerpt: string;
};

type EvidenceReport = {
  version: string;
  mode: string;
  generatedAt: string;
  reportId: string;
  rows: Array<{ candidates: EvidenceCandidate[] }>;
};

const DOMAIN_HOLDS = new Map([
  ["buzzsneakers.gr", "SOURCE_REPEATS_RHODES_POSTAL_CODE_ACROSS_UNRELATED_BRANCHES_AND_LOGISTICS_POINTS"],
  ["carbon.gr", "STREET_ADDRESS_IS_POLLUTED_WITH_PHONE_NUMBER"],
  ["cicado.gr", "MERCHANT_IDENTITY_MISMATCH_MUST_BE_RESOLVED_BEFORE_LOCATION_IMPORT"],
  ["grecotel.com", "GENERIC_CORPORATE_ADDRESS_IS_NOT_A_SPECIFIC_CUSTOMER_LOCATION"],
  ["massage4kefalonia.com", "LOCALITY_CONFLICT_REQUIRES_MANUAL_CONFIRMATION"],
]);

const DUPLICATE_HOLDS = new Map([
  ["a8f0ae565c44e1f12fa2b00fe553f71f", "TRANSLITERATED_DUPLICATE_OF_GREEK_CICADO_ADDRESS"],
  ["8981095d583a6e5fb654130b283a8484", "TRANSLITERATED_DUPLICATE_OF_GREEK_MAVRI_THALASSA_ADDRESS"],
  ["2f7d6c91ea96057b1881765373d23cca", "DUPLICATE_MUSEUM_ADDRESS_WITH_NEIGHBORHOOD_IN_CITY_FIELD"],
  ["2f62aa4e34164fb6ad49cc6ea3ee226a", "DUPLICATE_PAVONE_ADDRESS_WITH_REVERSED_STREET_ORDER"],
  ["a370c80087db6cae9e6e92dc4802d361", "DUPLICATE_ROMEO_ADDRESS_WITH_NEIGHBORHOOD_IN_CITY_FIELD"],
]);

const INVALID_LOCALITIES = new Set(["attica", "αττικη", "el", "greece"]);

const CITY_NORMALIZATION: Record<string, { city: string; area?: string }> = {
  "athens": { city: "Αθήνα" },
  "athina": { city: "Αθήνα" },
  "αθηνα": { city: "Αθήνα" },
  "chalandri": { city: "Χαλάνδρι" },
  "χανια": { city: "Χανιά" },
  "chania": { city: "Χανιά" },
  "dafni": { city: "Δάφνη" },
  "evosmos": { city: "Εύοσμος" },
  "glifada": { city: "Γλυφάδα" },
  "korinthos": { city: "Κόρινθος" },
  "koropi": { city: "Κορωπί" },
  "κορωπι": { city: "Κορωπί" },
  "ladadika": { city: "Θεσσαλονίκη", area: "Λαδάδικα" },
  "larisa": { city: "Λάρισα" },
  "marousi": { city: "Μαρούσι" },
  "peristeri": { city: "Περιστέρι" },
  "pireas": { city: "Πειραιάς" },
  "piraeus": { city: "Πειραιάς" },
  "rethymno": { city: "Ρέθυμνο" },
  "rhodes": { city: "Ρόδος" },
  "rhodes old town": { city: "Ρόδος", area: "Παλιά Πόλη" },
  "serres": { city: "Σέρρες" },
  "sparti": { city: "Σπάρτη" },
  "thessaloniki": { city: "Θεσσαλονίκη" },
  "αγ παρασκευη": { city: "Αγία Παρασκευή" },
  "ελευθεριο ευοσμος": { city: "Εύοσμος", area: "Ελευθέριο" },
  "κεντρο θεσσαλονικης": { city: "Θεσσαλονίκη", area: "Κέντρο" },
};

const REGION_BY_CITY: Record<string, string> = {
  "Αγία Παρασκευή": "Αττική",
  "Αθήνα": "Αττική",
  "Γαλάτσι": "Αττική",
  "Γέρακας": "Αττική",
  "Γλυφάδα": "Αττική",
  "Δάφνη": "Αττική",
  "Ζωγράφου": "Αττική",
  "Ίλιον": "Αττική",
  "Καλλιθέα": "Αττική",
  "Κορωπί": "Αττική",
  "Μαρούσι": "Αττική",
  "Μέγαρα": "Αττική",
  "Νέα Ιωνία": "Αττική",
  "Νέο Ηράκλειο": "Αττική",
  "Πειραιάς": "Αττική",
  "Περιστέρι": "Αττική",
  "Χαϊδάρι": "Αττική",
  "Χαλάνδρι": "Αττική",
  "Θεσσαλονίκη": "Κεντρική Μακεδονία",
  "Διαβατά": "Κεντρική Μακεδονία",
  "Εύοσμος": "Κεντρική Μακεδονία",
  "Καλαμαριά": "Κεντρική Μακεδονία",
  "Κατερίνη": "Κεντρική Μακεδονία",
  "Σέρρες": "Κεντρική Μακεδονία",
  "Πτολεμαΐδα": "Δυτική Μακεδονία",
  "Άρτα": "Ήπειρος",
  "Λάρισα": "Θεσσαλία",
  "Τρίκαλα": "Θεσσαλία",
  "Κόρινθος": "Πελοπόννησος",
  "Σπάρτη": "Πελοπόννησος",
  "Πύργος": "Δυτική Ελλάδα",
  "Ηράκλειο": "Κρήτη",
  "Ρέθυμνο": "Κρήτη",
  "Χανιά": "Κρήτη",
  "Ρόδος": "Νότιο Αιγαίο",
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value?: string | null) {
  return (value || "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().replace(/,+$/, "");
}

function normalize(value?: string | null) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFrom(value: string) {
  try {
    return getDomain(new URL(value).hostname) || new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function canonicalLocation(candidate: EvidenceCandidate) {
  const normalizedLocality = normalize(candidate.addressLocality);
  const mapped = CITY_NORMALIZATION[normalizedLocality];
  let city = mapped?.city || cleanText(candidate.addressLocality);
  let area = mapped?.area || null;

  if (normalizedLocality === "αιγαλεω αθηνα") city = "Αιγάλεω";
  if (normalizedLocality === "iraklio" && candidate.postalCode?.startsWith("141")) city = "Νέο Ηράκλειο";
  if (normalizedLocality === "ηρακλειο" && candidate.postalCode?.startsWith("713")) city = "Ηράκλειο";

  const normalizedAddress = normalize(candidate.streetAddress);
  if (normalizedAddress.includes("διαβατα")) city = "Διαβατά";
  if (normalizedAddress.includes("ευοσμος")) city = "Εύοσμος";
  if (normalizedAddress.includes("καλαμαρια")) city = "Καλαμαριά";
  if (normalizedAddress.includes("περισσος")) area = "Περισσός";
  if (normalizedAddress.includes("city center")) area = "Κέντρο";
  if (normalizedAddress.includes("astiggos")) area = "Μοναστηράκι";

  const normalizedCity = normalize(city);
  const commonGreekCity = Object.keys(REGION_BY_CITY).find((value) => normalize(value) === normalizedCity);
  if (commonGreekCity) city = commonGreekCity;
  const administrativeArea = REGION_BY_CITY[city] || null;
  return { city, area, administrativeArea };
}

function strictDecision(candidate: EvidenceCandidate) {
  if (candidate.bucket !== "SAFE") return { safe: false, reason: candidate.reason };
  if (candidate.extractionMethod !== "JSON_LD") return { safe: false, reason: "ONLY_JSON_LD_IS_AUTO_IMPORTABLE" };
  const domainHold = DOMAIN_HOLDS.get(domainFrom(candidate.sourceUrl));
  if (domainHold) return { safe: false, reason: domainHold };
  const duplicateHold = candidate.normalizedKey ? DUPLICATE_HOLDS.get(candidate.normalizedKey) : null;
  if (duplicateHold) return { safe: false, reason: duplicateHold };
  if (!candidate.normalizedKey || !candidate.streetAddress || !candidate.addressLocality || !candidate.postalCode) {
    return { safe: false, reason: "INCOMPLETE_LOCATION_IDENTITY" };
  }
  if (!/\d/.test(candidate.streetAddress)) return { safe: false, reason: "STREET_NUMBER_MISSING" };
  if (INVALID_LOCALITIES.has(normalize(candidate.addressLocality))) return { safe: false, reason: "CITY_FIELD_IS_NOT_A_CITY" };
  const physicalTypes = candidate.schemaTypes.filter((type) => type !== "Organization" && type !== "OnlineStore");
  if (!physicalTypes.length) return { safe: false, reason: "ONLINE_ORGANIZATION_ADDRESS_NOT_CUSTOMER_LOCATION" };
  return { safe: true, reason: "OFFICIAL_COMPLETE_PHYSICAL_BUSINESS_JSON_LD" };
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function immutableReportPath(filePath: string, hash: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${hash.slice(0, 16)}${parsed.ext}`);
}

async function catalogFingerprint() {
  const merchants = await prisma.merchant.findMany({
    where: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      giftCards: { where: { status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true, status: true } },
      locations: { orderBy: { normalizedKey: "asc" }, select: { normalizedKey: true, verificationStatus: true, active: true, sourceUrl: true } },
    },
  });
  return stableHash(merchants);
}

async function buildPlan() {
  if (!fs.existsSync(EVIDENCE_JSON)) throw new Error(`Missing evidence report: ${EVIDENCE_JSON}`);
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_JSON, "utf8")) as EvidenceReport;
  if (evidence.version !== EVIDENCE_VERSION || evidence.mode !== "EVIDENCE_ONLY") {
    throw new Error(`Unsupported evidence report: ${evidence.version}/${evidence.mode}`);
  }
  const activeRows = await prisma.merchant.findMany({
    where: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    select: { id: true, giftCards: { where: { status: "ACTIVE" }, select: { id: true } }, locations: { select: { normalizedKey: true } } },
  });
  const active = new Map(activeRows.map((merchant) => [merchant.id, merchant]));
  const actions = [];
  const reviews = [];
  const candidates = evidence.rows.flatMap((row) => row.candidates);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const merchant = active.get(candidate.merchantId);
    const decision = strictDecision(candidate);
    const common = {
      merchantId: candidate.merchantId,
      merchantName: candidate.merchantName,
      giftCardId: candidate.giftCardId,
      sourceUrl: candidate.sourceUrl,
      normalizedKey: candidate.normalizedKey,
      label: cleanText(candidate.label) || null,
      addressLine: cleanText(candidate.streetAddress) || null,
      sourceCity: cleanText(candidate.addressLocality) || null,
      postalCode: cleanText(candidate.postalCode) || null,
      schemaTypes: candidate.schemaTypes,
    };
    if (!merchant || !merchant.giftCards.some((card) => card.id === candidate.giftCardId)) {
      reviews.push({ ...common, reason: "CATALOG_TARGET_NO_LONGER_ACTIVE" });
      continue;
    }
    if (!decision.safe || !candidate.normalizedKey || !candidate.streetAddress || !candidate.addressLocality || !candidate.postalCode) {
      reviews.push({ ...common, reason: decision.reason });
      continue;
    }
    if (merchant.locations.some((location) => location.normalizedKey === candidate.normalizedKey)) {
      reviews.push({ ...common, reason: "LOCATION_ALREADY_EXISTS" });
      continue;
    }
    const uniqueKey = `${candidate.merchantId}:${candidate.normalizedKey}`;
    if (seen.has(uniqueKey)) {
      reviews.push({ ...common, reason: "DUPLICATE_CANDIDATE_IN_EVIDENCE" });
      continue;
    }
    seen.add(uniqueKey);
    const canonical = canonicalLocation(candidate);
    const lastVerifiedAt = new Date(evidence.generatedAt);
    const nextReviewAt = new Date(lastVerifiedAt);
    nextReviewAt.setUTCMonth(nextReviewAt.getUTCMonth() + 6);
    const action = {
      ...common,
      normalizedKey: candidate.normalizedKey,
      addressLine: cleanText(candidate.streetAddress),
      city: canonical.city,
      area: canonical.area,
      administrativeArea: canonical.administrativeArea,
      countryCode: "GR",
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      sourceExcerpt: candidate.sourceExcerpt.slice(0, 2_000),
      verificationStatus: "VERIFIED" as const,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      nextReviewAt: nextReviewAt.toISOString(),
      reason: decision.reason,
    };
    actions.push({ ...action, actionId: stableHash(action) });
  }

  const planWithoutId = {
    version: VERSION,
    mode: "PREVIEW" as const,
    generatedAt: new Date().toISOString(),
    evidenceReportId: evidence.reportId,
    catalogFingerprint: await catalogFingerprint(),
    summary: {
      evidenceCandidates: candidates.length,
      safeActions: actions.length,
      reviewCandidates: reviews.length,
      merchantsCovered: new Set(actions.map((action) => action.merchantId)).size,
      citiesCovered: new Set(actions.map((action) => action.city)).size,
    },
    actions,
    reviews,
  };
  return { ...planWithoutId, planId: stableHash(planWithoutId) };
}

function readPlan() {
  if (!PLAN_ID_ARG) throw new Error("Missing --plan-id=<id>.");
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (plan.version !== VERSION) throw new Error(`Unsupported plan version: ${plan.version}`);
  if (plan.planId !== PLAN_ID_ARG) throw new Error("Plan ID does not match the saved preview.");
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  const rows = [
    ["status", "merchantId", "merchantName", "giftCardId", "label", "addressLine", "city", "area", "administrativeArea", "postalCode", "countryCode", "latitude", "longitude", "sourceUrl", "verificationStatus", "reason", "actionId"],
    ...plan.actions.map((action) => ["SAFE", action.merchantId, action.merchantName, action.giftCardId, action.label, action.addressLine, action.city, action.area, action.administrativeArea, action.postalCode, action.countryCode, action.latitude, action.longitude, action.sourceUrl, action.verificationStatus, action.reason, action.actionId]),
    ...plan.reviews.map((review) => ["REVIEW", review.merchantId, review.merchantName, review.giftCardId, review.label, review.addressLine, review.sourceCity, "", "", review.postalCode, "", "", "", review.sourceUrl, "", review.reason, ""]),
  ];
  fs.writeFileSync(PLAN_CSV, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  fs.copyFileSync(PLAN_JSON, immutableReportPath(PLAN_JSON, plan.planId));
  fs.copyFileSync(PLAN_CSV, immutableReportPath(PLAN_CSV, plan.planId));
  console.log("Dorokartes Location Import v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Evidence candidates: ${plan.summary.evidenceCandidates}`);
  console.log(`Safe locations: ${plan.summary.safeActions}`);
  console.log(`Review candidates: ${plan.summary.reviewCandidates}`);
  console.log(`Merchants covered: ${plan.summary.merchantsCovered}`);
  console.log(`Cities covered: ${plan.summary.citiesCovered}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function apply() {
  const plan = readPlan();
  if (await catalogFingerprint() !== plan.catalogFingerprint) {
    throw new Error("Catalog/location state changed after preview. Generate and inspect a new plan.");
  }
  await prisma.$transaction(async (tx) => {
    for (const action of plan.actions) {
      await tx.merchantLocation.create({
        data: {
          merchantId: action.merchantId,
          label: action.label,
          countryCode: action.countryCode,
          administrativeArea: action.administrativeArea,
          city: action.city,
          area: action.area,
          addressLine: action.addressLine,
          postalCode: action.postalCode,
          latitude: action.latitude,
          longitude: action.longitude,
          normalizedKey: action.normalizedKey,
          sourceUrl: action.sourceUrl,
          sourceExcerpt: action.sourceExcerpt,
          verificationStatus: action.verificationStatus,
          lastVerifiedAt: new Date(action.lastVerifiedAt),
          nextReviewAt: new Date(action.nextReviewAt),
        },
      });
    }
  }, { maxWait: 15_000, timeout: 60_000 });
  const report = { version: VERSION, mode: "APPLY", planId: plan.planId, appliedAt: new Date().toISOString(), applied: plan.actions.length };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(APPLY_JSON, immutableReportPath(APPLY_JSON, stableHash(report)));
  console.log("Dorokartes Location Import v1 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${report.applied}`);
}

async function postAudit() {
  const plan = readPlan();
  if (!fs.existsSync(APPLY_JSON)) throw new Error(`Missing successful apply report: ${APPLY_JSON}`);
  const applyReport = JSON.parse(fs.readFileSync(APPLY_JSON, "utf8"));
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Successful apply report does not match the requested preview plan.");
  }
  const locations = await prisma.merchantLocation.findMany({
    where: { merchantId: { in: plan.actions.map((action: { merchantId: string }) => action.merchantId) } },
    select: { merchantId: true, normalizedKey: true, sourceUrl: true, verificationStatus: true, active: true, city: true, addressLine: true },
  });
  const failed = plan.actions.filter((action: { merchantId: string; normalizedKey: string; sourceUrl: string; city: string; addressLine: string }) => !locations.some((location) =>
    location.merchantId === action.merchantId &&
    location.normalizedKey === action.normalizedKey &&
    location.sourceUrl === action.sourceUrl &&
    location.verificationStatus === "VERIFIED" &&
    location.active &&
    location.city === action.city &&
    location.addressLine === action.addressLine,
  ));
  const report = { version: VERSION, mode: "POST_AUDIT", planId: plan.planId, auditedAt: new Date().toISOString(), checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action: { actionId: string }) => action.actionId) };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(POST_AUDIT_JSON, immutableReportPath(POST_AUDIT_JSON, stableHash(report)));
  console.log("Dorokartes Location Import v1 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  try {
    if (APPLY) await apply();
    else if (POST_AUDIT) await postAudit();
    else await preview();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
