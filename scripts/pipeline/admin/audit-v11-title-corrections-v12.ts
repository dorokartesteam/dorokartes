import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const REPORT_DIR = path.join(process.cwd(), "reports");
const SOURCE_PLAN = path.join(REPORT_DIR, "full-catalog-cleanup-v11-plan.json");
const SOURCE_APPLY_LOG = path.join(REPORT_DIR, "full-catalog-cleanup-v11-apply.json");
const OUTPUT_JSON = path.join(REPORT_DIR, "v11-title-correction-audit-v12.json");
const OUTPUT_CSV = path.join(REPORT_DIR, "v11-title-correction-audit-v12.csv");

type Classification = "SAFE_CANONICAL" | "PRESERVE_PROGRAM_NAME" | "MANUAL_REVIEW";

type TitleAction = {
  type: "UPDATE_CARD_TITLE";
  actionId: string;
  cardId: string;
  merchantId: string;
  expected: string;
  value: string;
  reason: string;
  evidence: string[];
};

type V11Plan = {
  planId: string;
  actions: Array<Record<string, unknown>>;
};

type V11ApplyLog = {
  appliedAt: string;
  planId: string;
  appliedCount: number;
  applied: Array<{ actionId: string; result: string }>;
};

const PRESERVE_PROGRAM: Record<string, { proposedTitle: string; reason: string }> = {
  cmtb77fxv002pdkiyob6nfyir: {
    proposedTitle: "Oxygen Plus Luxurious Day Spa Gift Card",
    reason: "The old title identifies a specific day-spa offering, not merely merchant or SEO noise.",
  },
  cmtb78c4x0076dkiyi0rou2i6: {
    proposedTitle: "Stretch & Relax Massage & Pilates Gift Card",
    reason: "Massage and Pilates define the services covered by this specific gift-card program.",
  },
  cmtb7hwow000704iyt99hm2lp: {
    proposedTitle: "Bioaroma Crete Spa Gift Card",
    reason: "Spa distinguishes this offering from the merchant's broader product catalog.",
  },
  cmtb7hx2h000904iykt7d99h5: {
    proposedTitle: "Calisti Oia Honeymoon Spa Gift Card",
    reason: "Honeymoon spa is a distinct experience signal that should remain in the program title.",
  },
  cmtb7i194000v04iygg8ltr9f: {
    proposedTitle: "Prepare for Greece Greek Language Course Gift Card",
    reason: "The gift card is tied to a Greek-language course rather than an unspecified merchant-wide balance.",
  },
  cmtb7i2ay001004iy2mok8p6r: {
    proposedTitle: "Mindful Touch Massage Gift Card",
    reason: "Massage describes the specific service program and is not retained by the canonical merchant name.",
  },
};

const MANUAL_REVIEW: Record<string, string> = {
  cmta4z4qr003xsciyykm8w59d:
    "The old title stated that the card is electronic; confirm that the digital channel is represented in variants/delivery data.",
  cmtb6uqep001u3giya6xdb0l8:
    "The old title stated digital/online availability; verify structured channel data before closing the correction.",
  cmtb6urib00203giyzhdgmnv4:
    "The removed electronic-card qualifier belongs in variant/channel data and needs an explicit evidence check.",
  cmtb7769p001bdkiyujfcxt1s:
    "The token d75 and the denomination-specific URL may encode a €75 value that is not yet represented structurally.",
  cmtb77bgd0021dkiyy3u2x8qn:
    "Super Dad appears to be an occasion/design label; keep one canonical program but verify Father’s Day taxonomy coverage.",
  cmtb77ckx0027dkiyltinns4m:
    "The removed DIGITAL qualifier needs confirmation in GiftCardVariant before this title change is fully closed.",
  cmtb77p0o0040dkiyr700iran:
    "Name Day is an occasion signal; confirm whether it is taxonomy metadata or a genuinely distinct program.",
  cmtb77qi60048dkiyu8khlp3s:
    "Valentine’s Day is an occasion signal; confirm taxonomy coverage and whether the merchant exposes a separate program.",
  cmtb77r83004bdkiycl9k0utt:
    "The removed electronic-card qualifier needs structured variant/channel confirmation.",
  cmtb77uej004rdkiydqqx9ujt:
    "Super Mom appears to be an occasion/design label; verify Mother’s Day taxonomy rather than assuming a separate program.",
  cmtb77yht005ddkiykt4vsu49:
    "Digital availability and the Ioannina location were removed; verify channel evidence and avoid inventing geographic availability.",
  cmtb7hxhc000b04iy3qi3vpga:
    "Online and in-store availability should be represented structurally; verify both channels before closing this item.",
  cmtb7i474001904iye9qfchj3:
    "The removed Digital qualifier needs explicit GiftCardVariant or delivery evidence.",
};

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Required input is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {} as Record<T, number>);
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(rows: Array<Record<string, unknown>>) {
  const headers = [
    "classification",
    "cardId",
    "merchantId",
    "merchantName",
    "oldTitle",
    "v11Title",
    "currentTitle",
    "proposedTitle",
    "officialUrl",
    "reason",
    "variantEvidence",
    "categories",
    "occasions",
    "relationCounts",
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(OUTPUT_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const plan = readJson<V11Plan>(SOURCE_PLAN);
  const applyLog = readJson<V11ApplyLog>(SOURCE_APPLY_LOG);
  if (plan.planId !== applyLog.planId) {
    throw new Error(`Plan/apply mismatch: ${plan.planId} != ${applyLog.planId}`);
  }

  const titleActions = plan.actions.filter(
    (action): action is TitleAction => action.type === "UPDATE_CARD_TITLE",
  );
  const actionIds = new Set(titleActions.map((action) => action.actionId));
  const appliedIds = new Set(applyLog.applied.map((action) => action.actionId));
  for (const action of titleActions) {
    if (!appliedIds.has(action.actionId)) throw new Error(`Title action was not applied: ${action.actionId}`);
  }

  const decisionIds = new Set([...Object.keys(PRESERVE_PROGRAM), ...Object.keys(MANUAL_REVIEW)]);
  for (const cardId of decisionIds) {
    if (!titleActions.some((action) => action.cardId === cardId)) {
      throw new Error(`Decision ledger contains a card outside the applied title actions: ${cardId}`);
    }
  }
  if (Object.keys(PRESERVE_PROGRAM).some((cardId) => cardId in MANUAL_REVIEW)) {
    throw new Error("A card cannot be both PRESERVE_PROGRAM_NAME and MANUAL_REVIEW.");
  }

  const cards = await prisma.giftCard.findMany({
    where: { id: { in: titleActions.map((action) => action.cardId) } },
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      merchant: { select: { name: true } },
      variants: {
        select: {
          name: true,
          type: true,
          customValueAllowed: true,
          minValue: true,
          maxValue: true,
          values: { select: { value: true }, orderBy: { value: "asc" } },
          redemptions: { select: { channel: true } },
          deliveries: { select: { method: true } },
        },
        orderBy: { id: "asc" },
      },
      categories: { select: { category: { select: { name: true, slug: true } } } },
      occasions: { select: { occasion: { select: { name: true, slug: true } } } },
      _count: {
        select: {
          variants: true,
          categories: true,
          occasions: true,
          sources: true,
          mediaAssets: true,
          clicks: true,
          verificationEvents: true,
          reviewFlags: true,
          productionVerificationSnapshots: true,
        },
      },
    },
  });

  if (cards.length !== titleActions.length) {
    throw new Error(`Expected ${titleActions.length} current cards, found ${cards.length}.`);
  }
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const rows = titleActions.map((action) => {
    const card = cardsById.get(action.cardId);
    if (!card) throw new Error(`Current card is missing: ${action.cardId}`);
    if (card.merchantId !== action.merchantId && !action.reason.includes("merchant split")) {
      throw new Error(`Unexpected merchant drift for ${action.cardId}.`);
    }
    if (card.title !== action.value) {
      throw new Error(`Title drift for ${action.cardId}: expected current title '${action.value}', found '${card.title}'.`);
    }

    let classification: Classification = "SAFE_CANONICAL";
    let proposedTitle = action.value;
    let reason =
      "The removed text is generic gift-card wording, page-title/SEO noise, marketing copy, or a descriptor already retained by the canonical merchant identity.";
    if (PRESERVE_PROGRAM[action.cardId]) {
      classification = "PRESERVE_PROGRAM_NAME";
      proposedTitle = PRESERVE_PROGRAM[action.cardId].proposedTitle;
      reason = PRESERVE_PROGRAM[action.cardId].reason;
    } else if (MANUAL_REVIEW[action.cardId]) {
      classification = "MANUAL_REVIEW";
      reason = MANUAL_REVIEW[action.cardId];
    }

    return {
      classification,
      cardId: action.cardId,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      oldTitle: action.expected,
      v11Title: action.value,
      currentTitle: card.title,
      proposedTitle,
      officialUrl: card.officialUrl,
      reason,
      variantEvidence: card.variants.map((variant) => ({
        name: variant.name,
        type: variant.type,
        customValueAllowed: variant.customValueAllowed,
        minValue: variant.minValue?.toString() ?? null,
        maxValue: variant.maxValue?.toString() ?? null,
        values: variant.values.map((item) => item.value.toString()),
        redemptions: variant.redemptions.map((item) => item.channel),
        deliveries: variant.deliveries.map((item) => item.method),
      })),
      categories: card.categories.map((item) => item.category),
      occasions: card.occasions.map((item) => item.occasion),
      relationCounts: card._count,
    };
  });

  const summary = countBy(rows.map((row) => row.classification));
  const auditMaterial = JSON.stringify({ sourcePlanId: plan.planId, rows });
  const auditId = crypto.createHash("sha256").update(auditMaterial).digest("hex");
  const report = {
    version: 12,
    mode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    auditId,
    sourcePlanId: plan.planId,
    sourceAppliedAt: applyLog.appliedAt,
    sourceAppliedActions: applyLog.appliedCount,
    sourceTitleActions: titleActions.length,
    verifiedAppliedTitleActions: [...actionIds].filter((actionId) => appliedIds.has(actionId)).length,
    databaseWrites: 0,
    summary,
    rows,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(rows);

  console.log("Dorokartes v11 Title Correction Audit v12 — READ ONLY");
  console.log(`Source plan: ${plan.planId}`);
  console.log(`Title actions verified: ${titleActions.length}`);
  for (const [classification, count] of Object.entries(summary)) {
    console.log(`  ${classification}: ${count}`);
  }
  console.log(`Audit ID: ${auditId}`);
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`CSV:  ${OUTPUT_CSV}`);
  console.log("Database writes: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
