import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const VERSION = "invalid-location-coordinates-v2" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const REQUESTED_PLAN_ID = process.argv
  .find((argument) => argument.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, `${VERSION}-plan.json`);
const PLAN_CSV = path.join(REPORT_DIR, `${VERSION}-plan.csv`);
const APPLY_JSON = path.join(REPORT_DIR, `${VERSION}-apply.json`);
const POST_AUDIT_JSON = path.join(REPORT_DIR, `${VERSION}-post-audit.json`);
const GREECE = { minLatitude: 34, maxLatitude: 42.5, minLongitude: 18, maxLongitude: 30 };

type Reason = "ZERO_SENTINEL" | "PARTIAL_COORDINATE_PAIR" | "OUTSIDE_GREECE_BOUNDS";
type Action = {
  actionId: string;
  locationId: string;
  merchantId: string;
  merchantName: string;
  city: string;
  addressLine: string;
  sourceUrl: string;
  oldLatitude: string | null;
  oldLongitude: string | null;
  reason: Reason;
  newLatitude: null;
  newLongitude: null;
};
type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  locationFingerprint: string;
  planId: string;
  summary: {
    totalLocations: number;
    locationsWithCoordinates: number;
    validGreekCoordinatePairs: number;
    invalidCoordinatePairs: number;
    byReason: Record<string, number>;
    resultingLocationsWithCoordinates: number;
    locationsDeleted: 0;
  };
  actions: Action[];
};

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
function decimalText(value: { toString(): string } | null) {
  return value === null ? null : value.toString();
}
function invalidReason(latitude: string | null, longitude: string | null): Reason | null {
  if (latitude === null && longitude === null) return null;
  if (latitude === null || longitude === null) return "PARTIAL_COORDINATE_PAIR";
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (lat === 0 && lng === 0) return "ZERO_SENTINEL";
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < GREECE.minLatitude ||
    lat > GREECE.maxLatitude ||
    lng < GREECE.minLongitude ||
    lng > GREECE.maxLongitude
  ) {
    return "OUTSIDE_GREECE_BOUNDS";
  }
  return null;
}

async function loadLocations() {
  return prisma.merchantLocation.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      label: true,
      countryCode: true,
      administrativeArea: true,
      city: true,
      area: true,
      addressLine: true,
      postalCode: true,
      latitude: true,
      longitude: true,
      normalizedKey: true,
      sourceUrl: true,
      verificationStatus: true,
      active: true,
      merchant: { select: { name: true } },
    },
  });
}
type Location = Awaited<ReturnType<typeof loadLocations>>[number];
function fingerprint(locations: Location[]) {
  return hash(
    locations.map((location) => ({
      ...location,
      latitude: decimalText(location.latitude),
      longitude: decimalText(location.longitude),
    })),
  );
}
function material(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}
function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...rest } = plan;
  if (hash(material(rest)) !== plan.planId) throw new Error("Stored plan hash is invalid.");
}
function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCsv(plan: Plan, filePath: string) {
  const headers = [
    "actionId", "locationId", "merchantName", "city", "addressLine", "oldLatitude",
    "oldLongitude", "reason", "newLatitude", "newLongitude", "sourceUrl",
  ];
  const lines = [
    headers.join(","),
    ...plan.actions.map((action) =>
      headers.map((header) => csvEscape(action[header as keyof Action])).join(","),
    ),
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function buildPlan(): Promise<Plan> {
  const locations = await loadLocations();
  const actions = locations.flatMap((location): Action[] => {
    const oldLatitude = decimalText(location.latitude);
    const oldLongitude = decimalText(location.longitude);
    const reason = invalidReason(oldLatitude, oldLongitude);
    if (!reason) return [];
    const actionBase = {
      locationId: location.id,
      merchantId: location.merchantId,
      merchantName: location.merchant.name,
      city: location.city,
      addressLine: location.addressLine,
      sourceUrl: location.sourceUrl,
      oldLatitude,
      oldLongitude,
      reason,
      newLatitude: null,
      newLongitude: null,
    };
    return [{ actionId: hash(actionBase), ...actionBase }];
  });
  const withCoordinates = locations.filter(
    (location) => location.latitude !== null || location.longitude !== null,
  ).length;
  const byReason = Object.fromEntries(
    [...new Set(actions.map((action) => action.reason))]
      .sort()
      .map((reason) => [reason, actions.filter((action) => action.reason === reason).length]),
  );
  const planBase = {
    version: VERSION,
    mode: "PREVIEW" as const,
    locationFingerprint: fingerprint(locations),
    summary: {
      totalLocations: locations.length,
      locationsWithCoordinates: withCoordinates,
      validGreekCoordinatePairs: withCoordinates - actions.length,
      invalidCoordinatePairs: actions.length,
      byReason,
      resultingLocationsWithCoordinates: withCoordinates - actions.length,
      locationsDeleted: 0 as const,
    },
    actions,
  };
  return { ...planBase, generatedAt: new Date().toISOString(), planId: hash(material(planBase)) };
}

function readStoredPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID || REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Apply/post-audit requires the exact --plan-id from preview.");
  }
  return plan;
}
async function databaseStats() {
  const [giftCards, locations, capabilities, rows] = await Promise.all([
    prisma.giftCard.count(),
    prisma.merchantLocation.count(),
    prisma.giftCardLocationCapability.count(),
    loadLocations(),
  ]);
  const withCoordinates = rows.filter(
    (location) => location.latitude !== null || location.longitude !== null,
  ).length;
  const invalidCoordinates = rows.filter((location) =>
    invalidReason(decimalText(location.latitude), decimalText(location.longitude)),
  ).length;
  return { giftCards, locations, capabilities, withCoordinates, invalidCoordinates };
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan, PLAN_CSV);
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Invalid Location Coordinates v2 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Locations: ${plan.summary.totalLocations}`);
  console.log(`Invalid coordinate pairs to clear: ${plan.summary.invalidCoordinatePairs}`);
  console.log(`Valid Greek coordinate pairs preserved: ${plan.summary.validGreekCoordinatePairs}`);
  console.log("PREVIEW ONLY — no database rows changed and no locations deleted.");
}

async function applyPlan() {
  const plan = readStoredPlan();
  const locations = await loadLocations();
  if (fingerprint(locations) !== plan.locationFingerprint) {
    throw new Error("Location state changed after preview. Generate a new plan.");
  }
  const before = await databaseStats();
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        const current = await tx.merchantLocation.findUnique({
          where: { id: action.locationId },
          select: { latitude: true, longitude: true },
        });
        if (
          !current ||
          decimalText(current.latitude) !== action.oldLatitude ||
          decimalText(current.longitude) !== action.oldLongitude
        ) {
          throw new Error(`Coordinate precondition failed: ${action.locationId}`);
        }
        await tx.merchantLocation.update({
          where: { id: action.locationId },
          data: { latitude: null, longitude: null },
        });
      }
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const after = await databaseStats();
  if (
    after.giftCards !== before.giftCards ||
    after.locations !== before.locations ||
    after.capabilities !== before.capabilities ||
    after.invalidCoordinates !== 0 ||
    after.withCoordinates !== plan.summary.resultingLocationsWithCoordinates
  ) {
    throw new Error("Post-apply cardinality or coordinate invariant failed.");
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
  console.log(`APPLY ${report.applied}: locations ${before.locations} -> ${after.locations}; invalid coordinates ${before.invalidCoordinates} -> ${after.invalidCoordinates}`);
}

async function postAudit() {
  const plan = readStoredPlan();
  const applyReport = readJson<{
    planId: string;
    applied: number;
    before: Awaited<ReturnType<typeof databaseStats>>;
    after: Awaited<ReturnType<typeof databaseStats>>;
  }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Apply report mismatch.");
  }
  const current = await databaseStats();
  const cleared = plan.actions.length
    ? await prisma.merchantLocation.count({
        where: { id: { in: plan.actions.map((action) => action.locationId) }, latitude: null, longitude: null },
      })
    : 0;
  const invariants = {
    allActionsCleared: cleared === plan.actions.length,
    giftCardsPreserved: current.giftCards === applyReport.before.giftCards,
    locationsPreserved: current.locations === applyReport.before.locations,
    capabilitiesPreserved: current.capabilities === applyReport.before.capabilities,
    noInvalidCoordinatesRemain: current.invalidCoordinates === 0,
  };
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: plan.actions.length,
    passed: cleared,
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
  if (Object.values(invariants).some((value) => !value)) throw new Error("Post-audit failed.");
  console.log(`POST-AUDIT ${cleared}/${plan.actions.length}; ${current.locations} locations and ${current.giftCards} gift cards preserved.`);
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  if (APPLY) await applyPlan();
  else if (POST_AUDIT) await postAudit();
  else await preview();
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
