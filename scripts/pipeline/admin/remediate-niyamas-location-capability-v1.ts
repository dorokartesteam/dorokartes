import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = 1 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, "niyamas-location-capability-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "niyamas-location-capability-v1-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "niyamas-location-capability-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "niyamas-location-capability-v1-post-audit.json");

const SPECIFICATION = {
  cardId: "cmta1fnrb0031q8iyg9sqt1g1",
  merchantId: "cmta1fnl10030q8iyjnfimm6o",
  merchantName: "Niyamas Yoga",
  cardTitle: "Niyamas Yoga Gift Card",
  websiteUrl: "https://niyamas-yoga.com",
  giftCardUrl: "https://niyamas-yoga.com/product/gift-card/",
  contactUrl: "https://niyamas-yoga.com/contact/",
  location: {
    label: "Niyamas Yoga",
    countryCode: "GR",
    administrativeArea: "Αττική",
    city: "Περιστέρι",
    area: null,
    addressLine: "Ζήνωνος 51",
    postalCode: "12133",
    latitude: 38.019682,
    longitude: 23.695388,
  },
  addressExcerpt: "Διεύθυνση Φυσικού Καταστήματος — Ζήνωνος 51, Τ.Κ. 12133, Περιστέρι, Αθήνα, Ελλάδα",
  capabilityExcerpt:
    "Ηλεκτρονική Δωροκάρτα Gift Card Niyamas για αγορές από το ηλεκτρονικό ή το φυσικό μας κατάστημα Niyamas Yoga.",
} as const;

type Evidence = {
  contact: {
    requestedUrl: string;
    finalUrl: string;
    status: number;
    title: string;
    addressMatched: boolean;
    mapEmbedUrl: string;
    latitude: number;
    longitude: number;
  };
  giftCard: {
    requestedUrl: string;
    finalUrl: string;
    status: number;
    title: string;
    giftIdentityMatched: boolean;
    physicalStoreRedemptionMatched: boolean;
  };
};

type Action =
  | {
      type: "CREATE_MERCHANT_LOCATION";
      actionId: string;
      merchantId: string;
      giftCardId: string;
      normalizedKey: string;
      sourceUrl: string;
      sourceExcerpt: string;
      value: typeof SPECIFICATION.location;
    }
  | {
      type: "CREATE_LOCATION_CAPABILITY";
      actionId: string;
      merchantId: string;
      giftCardId: string;
      normalizedKey: string;
      capability: "REDEEM_IN_STORE";
      available: true;
      sourceUrl: string;
      sourceExcerpt: string;
    };

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  targetFingerprint: string;
  evidenceFingerprint: string;
  normalizedKey: string;
  targetCount: 1;
  actionCount: 2;
  actions: Action[];
  evidence: Evidence;
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function registeredDomain(value: string) {
  const url = new URL(value);
  return getDomain(url.hostname) || url.hostname.replace(/^www\./i, "").toLowerCase();
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function fetchOfficialPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await response.text();
    return { response, html };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectEvidence(): Promise<Evidence> {
  const [contactResult, giftCardResult] = await Promise.all([
    fetchOfficialPage(SPECIFICATION.contactUrl),
    fetchOfficialPage(SPECIFICATION.giftCardUrl),
  ]);
  const expectedDomain = registeredDomain(SPECIFICATION.websiteUrl);
  for (const result of [contactResult, giftCardResult]) {
    if (!result.response.ok) throw new Error(`Official evidence HTTP ${result.response.status}.`);
    if (registeredDomain(result.response.url) !== expectedDomain) {
      throw new Error("Official evidence redirected outside the merchant domain.");
    }
  }

  const contact = load(contactResult.html);
  contact("script,style,noscript,template").remove();
  const contactText = normalize(contact.root().text());
  const mapEmbedUrl =
    load(contactResult.html)("iframe[src*='google.com/maps/embed']").first().attr("src") || "";
  const coordinateMatch = mapEmbedUrl.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
  if (!coordinateMatch) throw new Error("Official contact page map coordinates are missing.");
  const longitude = Number(coordinateMatch[1]);
  const latitude = Number(coordinateMatch[2]);
  const addressMatched =
    contactText.includes("διευθυνση φυσικου καταστηματος") &&
    contactText.includes("ζηνωνος 51") &&
    contactText.includes("12133") &&
    contactText.includes("περιστερι") &&
    contactText.includes("αθηνα ελλαδα");
  if (!addressMatched) throw new Error("Official physical-store address evidence no longer matches.");
  if (
    Number(latitude.toFixed(6)) !== SPECIFICATION.location.latitude ||
    Number(longitude.toFixed(6)) !== SPECIFICATION.location.longitude
  ) {
    throw new Error("Official contact-page map coordinates changed.");
  }

  const giftCard = load(giftCardResult.html);
  giftCard("script,style,noscript,template").remove();
  const giftCardText = normalize(giftCard.root().text());
  const giftIdentityMatched =
    giftCardText.includes("ηλεκτρονικη δωροκαρτα") && giftCardText.includes("gift card niyamas");
  const physicalStoreRedemptionMatched =
    giftCardText.includes("για αγορες απο το ηλεκτρονικο η το φυσικο μας καταστημα niyamas yoga");
  if (!giftIdentityMatched || !physicalStoreRedemptionMatched) {
    throw new Error("Official gift-card physical-store evidence no longer matches.");
  }

  return {
    contact: {
      requestedUrl: SPECIFICATION.contactUrl,
      finalUrl: contactResult.response.url,
      status: contactResult.response.status,
      title: load(contactResult.html)("title").first().text().trim(),
      addressMatched,
      mapEmbedUrl,
      latitude,
      longitude,
    },
    giftCard: {
      requestedUrl: SPECIFICATION.giftCardUrl,
      finalUrl: giftCardResult.response.url,
      status: giftCardResult.response.status,
      title: load(giftCardResult.html)("title").first().text().trim(),
      giftIdentityMatched,
      physicalStoreRedemptionMatched,
    },
  };
}

async function loadTarget() {
  return prisma.giftCard.findUnique({
    where: { id: SPECIFICATION.cardId },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      updatedAt: true,
      merchant: {
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          status: true,
          updatedAt: true,
          locations: {
            orderBy: { normalizedKey: "asc" },
            select: { id: true, normalizedKey: true, active: true, verificationStatus: true },
          },
        },
      },
      variants: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          type: true,
          active: true,
          redemptions: { orderBy: { channel: "asc" }, select: { channel: true } },
        },
      },
      locationCapabilities: {
        orderBy: [{ merchantLocationId: "asc" }, { capability: "asc" }],
        select: {
          id: true,
          merchantLocationId: true,
          capability: true,
          available: true,
          verificationStatus: true,
        },
      },
    },
  });
}

function targetMaterial(target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>) {
  return {
    ...target,
    updatedAt: target.updatedAt.toISOString(),
    merchant: { ...target.merchant, updatedAt: target.merchant.updatedAt.toISOString() },
  };
}

function assertTargetPreconditions(target: Awaited<ReturnType<typeof loadTarget>>) {
  if (
    !target ||
    target.merchantId !== SPECIFICATION.merchantId ||
    target.title !== SPECIFICATION.cardTitle ||
    target.officialUrl !== SPECIFICATION.giftCardUrl ||
    target.status !== "ACTIVE" ||
    target.verificationStatus !== "NEEDS_REVIEW" ||
    target.merchant.id !== SPECIFICATION.merchantId ||
    target.merchant.name !== SPECIFICATION.merchantName ||
    target.merchant.websiteUrl !== SPECIFICATION.websiteUrl ||
    target.merchant.status !== "ACTIVE" ||
    target.merchant.locations.length !== 0 ||
    target.locationCapabilities.length !== 0 ||
    !target.variants.some(
      (variant) => variant.active && variant.redemptions.some((redemption) => redemption.channel === "PHYSICAL_STORE"),
    )
  ) {
    throw new Error("Niyamas target precondition failed.");
  }
  return target;
}

function normalizedKey() {
  return stableHash([
    normalize(SPECIFICATION.location.addressLine),
    normalize(SPECIFICATION.location.postalCode),
    normalize(SPECIFICATION.location.city),
    normalize(SPECIFICATION.location.countryCode),
  ]).slice(0, 32);
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  if (stableHash(planMaterial(material)) !== plan.planId) throw new Error("Stored plan ID is invalid.");
}

function assertPlanRequest(plan: Plan) {
  verifyPlan(plan);
  if (!REQUESTED_PLAN_ID) throw new Error("Apply/post-audit requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
}

function csvEscape(value: unknown) {
  const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(actions: Action[]) {
  const headers = [
    "type",
    "actionId",
    "merchantId",
    "giftCardId",
    "normalizedKey",
    "capability",
    "value",
    "sourceUrl",
    "sourceExcerpt",
  ];
  const lines = [
    headers.join(","),
    ...actions.map((action) =>
      headers
        .map((header) => csvEscape((action as unknown as Record<string, unknown>)[header]))
        .join(","),
    ),
  ];
  fs.writeFileSync(PLAN_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function preview() {
  const [target, evidence] = await Promise.all([loadTarget(), collectEvidence()]);
  const safeTarget = assertTargetPreconditions(target);
  const key = normalizedKey();
  const actions: Action[] = [
    {
      type: "CREATE_MERCHANT_LOCATION",
      actionId: `create-location:${SPECIFICATION.merchantId}:${key}`,
      merchantId: SPECIFICATION.merchantId,
      giftCardId: SPECIFICATION.cardId,
      normalizedKey: key,
      sourceUrl: SPECIFICATION.contactUrl,
      sourceExcerpt: SPECIFICATION.addressExcerpt,
      value: SPECIFICATION.location,
    },
    {
      type: "CREATE_LOCATION_CAPABILITY",
      actionId: `create-capability:${SPECIFICATION.cardId}:${key}:REDEEM_IN_STORE`,
      merchantId: SPECIFICATION.merchantId,
      giftCardId: SPECIFICATION.cardId,
      normalizedKey: key,
      capability: "REDEEM_IN_STORE",
      available: true,
      sourceUrl: SPECIFICATION.giftCardUrl,
      sourceExcerpt: SPECIFICATION.capabilityExcerpt,
    },
  ];
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    targetFingerprint: stableHash(targetMaterial(safeTarget)),
    evidenceFingerprint: stableHash(evidence),
    normalizedKey: key,
    targetCount: 1 as const,
    actionCount: 2 as const,
    actions,
    evidence,
  };
  const plan: Plan = {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `niyamas-location-capability-v1-plan-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  writeCsv(actions);
  console.log("Dorokartes Niyamas Location Capability v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`Actions: ${plan.actionCount}`);
  console.log(`Location: ${SPECIFICATION.location.addressLine}, ${SPECIFICATION.location.city}`);
  console.log("Capability: REDEEM_IN_STORE (purchase-in-store remains unknown)");
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function applyPlan() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const [target, evidence] = await Promise.all([loadTarget(), collectEvidence()]);
  const safeTarget = assertTargetPreconditions(target);
  if (stableHash(targetMaterial(safeTarget)) !== plan.targetFingerprint) {
    throw new Error("Niyamas database state changed after preview.");
  }
  if (stableHash(evidence) !== plan.evidenceFingerprint) {
    throw new Error("Live official evidence changed after preview.");
  }
  const now = new Date();
  const created = await prisma.$transaction(
    async (tx) => {
      const location = await tx.merchantLocation.create({
        data: {
          merchantId: SPECIFICATION.merchantId,
          label: SPECIFICATION.location.label,
          countryCode: SPECIFICATION.location.countryCode,
          administrativeArea: SPECIFICATION.location.administrativeArea,
          city: SPECIFICATION.location.city,
          area: SPECIFICATION.location.area,
          addressLine: SPECIFICATION.location.addressLine,
          postalCode: SPECIFICATION.location.postalCode,
          latitude: SPECIFICATION.location.latitude,
          longitude: SPECIFICATION.location.longitude,
          normalizedKey: plan.normalizedKey,
          sourceUrl: SPECIFICATION.contactUrl,
          sourceExcerpt: SPECIFICATION.addressExcerpt,
          active: true,
          verificationStatus: "VERIFIED",
          lastVerifiedAt: now,
        },
      });
      const capability = await tx.giftCardLocationCapability.create({
        data: {
          giftCardId: SPECIFICATION.cardId,
          merchantLocationId: location.id,
          capability: "REDEEM_IN_STORE",
          available: true,
          verificationStatus: "VERIFIED",
          sourceUrl: SPECIFICATION.giftCardUrl,
          sourceExcerpt: SPECIFICATION.capabilityExcerpt,
          lastVerifiedAt: now,
        },
      });
      return { locationId: location.id, capabilityId: capability.id };
    },
    { isolationLevel: "Serializable", maxWait: 20_000, timeout: 60_000 },
  );
  const report = {
    version: VERSION,
    mode: "APPLY",
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    appliedActions: plan.actionCount,
    ...created,
  };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `niyamas-location-capability-v1-apply-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Niyamas Location Capability v1 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied actions: ${report.appliedActions}`);
}

async function postAudit() {
  const plan = readJson<Plan>(PLAN_JSON);
  assertPlanRequest(plan);
  const applyReport = readJson<{
    planId: string;
    appliedActions: number;
    locationId: string;
    capabilityId: string;
  }>(APPLY_JSON);
  if (applyReport.planId !== plan.planId || applyReport.appliedActions !== plan.actionCount) {
    throw new Error("Apply report does not match the requested preview.");
  }
  const location = await prisma.merchantLocation.findUnique({
    where: { id: applyReport.locationId },
    include: { giftCardCapabilities: true },
  });
  const capability = location?.giftCardCapabilities.find((row) => row.id === applyReport.capabilityId);
  const checks = {
    locationExists: Boolean(location),
    merchantMatches: location?.merchantId === SPECIFICATION.merchantId,
    normalizedKeyMatches: location?.normalizedKey === plan.normalizedKey,
    addressMatches:
      location?.addressLine === SPECIFICATION.location.addressLine &&
      location?.postalCode === SPECIFICATION.location.postalCode &&
      location?.city === SPECIFICATION.location.city &&
      location?.administrativeArea === SPECIFICATION.location.administrativeArea,
    coordinatesMatch:
      Number(location?.latitude) === SPECIFICATION.location.latitude &&
      Number(location?.longitude) === SPECIFICATION.location.longitude,
    locationVerified: location?.active === true && location?.verificationStatus === "VERIFIED",
    locationSourceMatches: location?.sourceUrl === SPECIFICATION.contactUrl,
    capabilityExists: Boolean(capability),
    capabilityMatches:
      capability?.giftCardId === SPECIFICATION.cardId &&
      capability?.capability === "REDEEM_IN_STORE" &&
      capability?.available === true &&
      capability?.verificationStatus === "VERIFIED",
    capabilitySourceMatches: capability?.sourceUrl === SPECIFICATION.giftCardUrl,
    noPurchaseClaim: !location?.giftCardCapabilities.some(
      (row) => row.giftCardId === SPECIFICATION.cardId && row.capability === "PURCHASE_IN_STORE",
    ),
  };
  const passed = Object.values(checks).every(Boolean);
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: Object.keys(checks).length,
    passed,
    databaseWrites: 0,
    checks,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `niyamas-location-capability-v1-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (!passed) throw new Error("Niyamas location/capability post-audit failed.");
  console.log("Dorokartes Niyamas Location Capability v1 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
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
