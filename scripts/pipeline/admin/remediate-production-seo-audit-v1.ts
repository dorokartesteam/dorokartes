import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";

const VERSION = "production-seo-audit-remediation-v1";
const APPLY = process.argv.includes("--apply");
const PLAN_ID_ARG = process.argv
  .find((argument) => argument.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);

const TARGETS = {
  perdikis: {
    id: "cmta1f3cy0011q8iy2c3kuujw",
    merchantId: "cmta1f37k0010q8iy77tcaeje",
    slug: "perdikis-ευχετηρια-καρτα-για-χρηματα-μπιλιετακι-pictura-ουρανιο-τοξο-19926",
    title: "ΕΥΧΕΤΗΡΙΑ ΚΑΡΤΑ ΓΙΑ ΧΡΗΜΑΤΑ (ΜΠΙΛΙΕΤΑΚΙ) PICTURA ΟΥΡΑΝΙΟ ΤΟΞΟ 19926",
    officialUrl: "https://www.perdikis.gr/",
    evidenceUrl: "https://www.perdikis.gr/1558001446-eyxetiries-kartes",
  },
  evripidis: {
    id: "cmta1g9lo004yq8iyerfuigi1",
    merchantId: "cmta1g94r004xq8iy50akgakb",
    slug: "evripidis-χαμηλες-τιμες-σε-χιλιαδες-ελληνικα-βιβλια",
    oldTitle: "ΧΑΜΗΛΕΣ ΤΙΜΕΣ ΣΕ ΧΙΛΙΑΔΕΣ ΕΛΛΗΝΙΚΑ ΒΙΒΛΙΑ",
    oldOfficialUrl:
      "https://www.evripidis.gr/%CE%B2%CE%B9%CE%B2%CE%BB%CE%B9%CE%B1/%CE%B2%CE%B9%CE%B2%CE%BB%CE%B9%CE%B1-%CF%83%CF%84%CE%B1-%CE%B5%CE%BB%CE%BB%CE%B7%CE%BD%CE%B9%CE%BA%CE%B1.htm?%CF%80%CF%81%CE%BF%CE%B9%CE%BF%CE%BD%CF%84%CE%B1-%CE%B3%CE%B9%CE%B1%5B%5D=%CE%B8%CE%B5%CE%BB%CF%89-%CE%BD%CE%B1-%CE%B4%CF%89%2Fweb-offers",
    newTitle: "Δωροκάρτες Ευριπίδης",
    newOfficialUrl: "https://www.evripidis.gr/gift-card.htm",
  },
} as const;

type PlanAction =
  | {
      type: "ARCHIVE_NON_PROGRAM";
      giftCardId: string;
      reason: string;
      evidenceUrl: string;
      before: {
        status: "ACTIVE";
        verificationStatus: "VERIFIED";
      };
      after: {
        status: "ARCHIVED";
        verificationStatus: "REJECTED";
      };
    }
  | {
      type: "REPAIR_VERIFIED_PROGRAM";
      giftCardId: string;
      reason: string;
      evidenceUrl: string;
      before: {
        title: string;
        officialUrl: string;
      };
      after: {
        title: string;
        officialUrl: string;
      };
    };

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadRows() {
  return prisma.giftCard.findMany({
    where: { id: { in: [TARGETS.perdikis.id, TARGETS.evripidis.id] } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      merchantId: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      verificationStatus: true,
      featured: true,
      categories: {
        select: {
          primary: true,
          category: { select: { slug: true } },
        },
      },
      _count: {
        select: {
          variants: true,
          sources: true,
          clicks: true,
        },
      },
    },
  });
}

type CatalogRow = Awaited<ReturnType<typeof loadRows>>[number];

function assertIdentity(
  row: CatalogRow,
  target: { id: string; merchantId: string; slug: string },
) {
  if (row.id !== target.id || row.merchantId !== target.merchantId || row.slug !== target.slug) {
    throw new Error(`Identity mismatch for target ${target.id}.`);
  }
  if (
    row.categories.length !== 1 ||
    row.categories[0]?.category.slug !== "books" ||
    row.categories[0]?.primary !== true
  ) {
    throw new Error(`Unexpected category state for target ${target.id}.`);
  }
}

function buildActions(rows: CatalogRow[]): PlanAction[] {
  if (rows.length !== 2) {
    const found = new Set(rows.map((row) => row.id));
    const missing = [TARGETS.perdikis.id, TARGETS.evripidis.id].filter((id) => !found.has(id));
    throw new Error(`Missing exact remediation target(s): ${missing.join(", ")}.`);
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const perdikis = rowsById.get(TARGETS.perdikis.id)!;
  const evripidis = rowsById.get(TARGETS.evripidis.id)!;
  assertIdentity(perdikis, TARGETS.perdikis);
  assertIdentity(evripidis, TARGETS.evripidis);

  const actions: PlanAction[] = [];

  const perdikisAlreadyArchived =
    perdikis.status === "ARCHIVED" && perdikis.verificationStatus === "REJECTED";
  if (!perdikisAlreadyArchived) {
    if (
      perdikis.title !== TARGETS.perdikis.title ||
      perdikis.officialUrl !== TARGETS.perdikis.officialUrl ||
      perdikis.status !== "ACTIVE" ||
      perdikis.verificationStatus !== "VERIFIED" ||
      perdikis._count.variants !== 0 ||
      perdikis._count.sources !== 0 ||
      perdikis._count.clicks !== 0
    ) {
      throw new Error("Perdikis preconditions changed; refusing automatic archive.");
    }
    actions.push({
      type: "ARCHIVE_NON_PROGRAM",
      giftCardId: perdikis.id,
      reason: "Physical greeting card with a money sleeve; not a stored-value gift-card program.",
      evidenceUrl: TARGETS.perdikis.evidenceUrl,
      before: { status: "ACTIVE", verificationStatus: "VERIFIED" },
      after: { status: "ARCHIVED", verificationStatus: "REJECTED" },
    });
  }

  const evripidisAlreadyRepaired =
    evripidis.title === TARGETS.evripidis.newTitle &&
    evripidis.officialUrl === TARGETS.evripidis.newOfficialUrl &&
    evripidis.status === "ACTIVE" &&
    evripidis.verificationStatus === "VERIFIED";
  if (!evripidisAlreadyRepaired) {
    if (
      evripidis.title !== TARGETS.evripidis.oldTitle ||
      evripidis.officialUrl !== TARGETS.evripidis.oldOfficialUrl ||
      evripidis.status !== "ACTIVE" ||
      evripidis.verificationStatus !== "VERIFIED"
    ) {
      throw new Error("Evripidis preconditions changed; refusing automatic repair.");
    }
    actions.push({
      type: "REPAIR_VERIFIED_PROGRAM",
      giftCardId: evripidis.id,
      reason: "Replace a generic books listing with the merchant's live official gift-card page.",
      evidenceUrl: TARGETS.evripidis.newOfficialUrl,
      before: {
        title: TARGETS.evripidis.oldTitle,
        officialUrl: TARGETS.evripidis.oldOfficialUrl,
      },
      after: {
        title: TARGETS.evripidis.newTitle,
        officialUrl: TARGETS.evripidis.newOfficialUrl,
      },
    });
  }

  return actions;
}

async function buildPlan() {
  const rows = await loadRows();
  const actions = buildActions(rows);
  const fingerprint = stableHash(rows);
  const planId = stableHash({ version: VERSION, fingerprint, actions });
  return { version: VERSION, fingerprint, planId, actions };
}

async function applyPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  if (!PLAN_ID_ARG) throw new Error("Missing --plan-id=<id> from the preview.");
  if (PLAN_ID_ARG !== plan.planId) {
    throw new Error("Plan ID mismatch; rerun preview and inspect the current catalog state.");
  }
  if (plan.actions.length === 0) {
    console.log("No database changes needed.");
    return;
  }

  const checkedAt = new Date();
  await prisma.$transaction(
    async (tx) => {
      for (const action of plan.actions) {
        if (action.type === "ARCHIVE_NON_PROGRAM") {
          const update = await tx.giftCard.updateMany({
            where: {
              id: TARGETS.perdikis.id,
              merchantId: TARGETS.perdikis.merchantId,
              slug: TARGETS.perdikis.slug,
              title: TARGETS.perdikis.title,
              officialUrl: TARGETS.perdikis.officialUrl,
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
            },
            data: {
              status: "ARCHIVED",
              verificationStatus: "REJECTED",
              featured: false,
              lastVerifiedAt: checkedAt,
            },
          });
          if (update.count !== 1) {
            throw new Error("Perdikis optimistic precondition failed; transaction rolled back.");
          }
          await tx.verificationEvent.create({
            data: {
              giftCardId: action.giftCardId,
              result: "FAILED",
              url: action.evidenceUrl,
              notes: `${VERSION}: ${action.reason}`,
            },
          });
        } else {
          const update = await tx.giftCard.updateMany({
            where: {
              id: TARGETS.evripidis.id,
              merchantId: TARGETS.evripidis.merchantId,
              slug: TARGETS.evripidis.slug,
              title: TARGETS.evripidis.oldTitle,
              officialUrl: TARGETS.evripidis.oldOfficialUrl,
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
            },
            data: {
              title: TARGETS.evripidis.newTitle,
              officialUrl: TARGETS.evripidis.newOfficialUrl,
              lastVerifiedAt: checkedAt,
            },
          });
          if (update.count !== 1) {
            throw new Error("Evripidis optimistic precondition failed; transaction rolled back.");
          }
          await tx.verificationEvent.create({
            data: {
              giftCardId: action.giftCardId,
              result: "CHANGED",
              url: action.evidenceUrl,
              notes: `${VERSION}: ${action.reason}`,
            },
          });
        }
      }
    },
    { maxWait: 15_000, timeout: 60_000, isolationLevel: "Serializable" },
  );
}

async function main() {
  const plan = await buildPlan();
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "APPLY" : "PREVIEW",
        generatedAt: new Date().toISOString(),
        ...plan,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("PREVIEW ONLY — database unchanged.");
    return;
  }

  await applyPlan(plan);
  const postRows = await loadRows();
  const remainingActions = buildActions(postRows);
  if (remainingActions.length !== 0) {
    throw new Error("Post-apply audit failed.");
  }
  console.log(
    JSON.stringify(
      {
        mode: "POST_AUDIT",
        verifiedAt: new Date().toISOString(),
        remainingActions: 0,
        rows: postRows,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
