import { loadEnvConfig } from "@next/env";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

const VERSION = "occasion-semantic-backfill-v8";

const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");

const PLAN_ID_ARG = process.argv
  .find((x) => x.startsWith("--plan-id="))
  ?.slice("--plan-id=".length);

const REPORT_DIR = path.resolve(
  process.cwd(),
  "reports",
  "catalog-audit",
);

const PLAN_JSON = path.join(
  REPORT_DIR,
  `${VERSION}-plan.json`,
);

const PLAN_CSV = path.join(
  REPORT_DIR,
  `${VERSION}-plan.csv`,
);

const APPLY_JSON = path.join(
  REPORT_DIR,
  `${VERSION}-apply.json`,
);

const POST_AUDIT_JSON = path.join(
  REPORT_DIR,
  `${VERSION}-post-audit.json`,
);

type OccasionRule = {
  slug: string;
  relevance: number;
};

const SAFE_BY_CATEGORY: Record<string, OccasionRule[]> = {
  fashion: [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 86 },
    { slug: "just-because", relevance: 78 },
  ],

  beauty: [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 86 },
    { slug: "mothers-day", relevance: 82 },
    { slug: "just-because", relevance: 78 },
  ],

  home: [
    { slug: "wedding", relevance: 88 },
    { slug: "christmas", relevance: 84 },
    { slug: "just-because", relevance: 76 },
  ],

  sports: [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 86 },
    { slug: "just-because", relevance: 76 },
  ],

  "spa-wellness": [
    { slug: "birthday", relevance: 92 },
    { slug: "anniversary", relevance: 90 },
    { slug: "valentines", relevance: 88 },
    { slug: "mothers-day", relevance: 86 },
    { slug: "fathers-day", relevance: 82 },
  ],

  "jewelry-watches": [
    { slug: "birthday", relevance: 94 },
    { slug: "anniversary", relevance: 94 },
    { slug: "wedding", relevance: 88 },
    { slug: "valentines", relevance: 92 },
    { slug: "christmas", relevance: 88 },
  ],

  "kids-baby": [
    { slug: "birthday", relevance: 94 },
    { slug: "for-kids", relevance: 96 },
    { slug: "christmas", relevance: 90 },
  ],

  "food-delivery": [
    { slug: "birthday", relevance: 84 },
    { slug: "thank-you", relevance: 84 },
    { slug: "just-because", relevance: 82 },
  ],

  travel: [
    { slug: "birthday", relevance: 88 },
    { slug: "anniversary", relevance: 92 },
    { slug: "wedding", relevance: 88 },
    { slug: "christmas", relevance: 82 },
  ],

  experiences: [
    { slug: "birthday", relevance: 94 },
    { slug: "anniversary", relevance: 90 },
    { slug: "valentines", relevance: 88 },
    { slug: "christmas", relevance: 84 },
  ],

  technology: [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 90 },
    { slug: "just-because", relevance: 76 },
  ],

  hotels: [
    { slug: "birthday", relevance: 84 },
    { slug: "anniversary", relevance: 96 },
    { slug: "wedding", relevance: 90 },
    { slug: "valentines", relevance: 92 },
  ],

  books: [
    { slug: "birthday", relevance: 90 },
    { slug: "christmas", relevance: 90 },
    { slug: "thank-you", relevance: 82 },
  ],

  restaurants: [
    { slug: "birthday", relevance: 92 },
    { slug: "anniversary", relevance: 94 },
    { slug: "valentines", relevance: 92 },
    { slug: "thank-you", relevance: 84 },
    { slug: "just-because", relevance: 84 },
  ],

  "gifts-concept-stores": [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 92 },
    { slug: "thank-you", relevance: 86 },
    { slug: "just-because", relevance: 88 },
  ],

  automotive: [
    { slug: "birthday", relevance: 86 },
    { slug: "christmas", relevance: 82 },
    { slug: "just-because", relevance: 76 },
  ],

  "arts-crafts": [
    { slug: "birthday", relevance: 90 },
    { slug: "christmas", relevance: 86 },
    { slug: "just-because", relevance: 78 },
  ],

  marketplaces: [
    { slug: "birthday", relevance: 90 },
    { slug: "christmas", relevance: 90 },
    { slug: "just-because", relevance: 82 },
  ],

  "department-stores": [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 92 },
    { slug: "wedding", relevance: 82 },
    { slug: "just-because", relevance: 82 },
  ],

  pets: [
    { slug: "just-because", relevance: 82 },
  ],

  gaming: [
    { slug: "birthday", relevance: 96 },
    { slug: "christmas", relevance: 94 },
    { slug: "just-because", relevance: 80 },
  ],

  music: [
    { slug: "birthday", relevance: 92 },
    { slug: "christmas", relevance: 88 },
    { slug: "just-because", relevance: 78 },
  ],

  "corporate-gifts": [
    { slug: "corporate", relevance: 100 },
    { slug: "christmas", relevance: 90 },
    { slug: "thank-you", relevance: 90 },
  ],

  "streaming-digital": [
    { slug: "birthday", relevance: 90 },
    { slug: "christmas", relevance: 92 },
    { slug: "just-because", relevance: 80 },
  ],
};

const REVIEW_ONLY: Record<string, string> = {
  pharmacy:
    "Pharmacy catalog can mix beauty, wellness, baby and medical products; category alone is insufficient.",

  education:
    "Education gift cards need course/product context before assigning birthday or graduation.",

  "health-medical":
    "Medical/health services should not receive generic gifting occasions from category alone.",

  "tobacco-vaping":
    "Age-restricted category; no generic semantic occasion is auto-assigned.",
};

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

async function loadTargets(prisma: any) {
  return prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      merchant: {
        status: "ACTIVE",
      },
      occasions: {
        none: {},
      },
    },

    orderBy: {
      id: "asc",
    },

    select: {
      id: true,
      title: true,
      updatedAt: true,

      merchant: {
        select: {
          id: true,
          name: true,
          updatedAt: true,
        },
      },

      categories: {
        select: {
          primary: true,
          categoryId: true,

          category: {
            select: {
              id: true,
              slug: true,
              name: true,
              active: true,
            },
          },
        },
      },
    },
  });
}

function targetMaterial(cards: any[]) {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    updatedAt: card.updatedAt.toISOString(),

    merchantId: card.merchant.id,
    merchantName: card.merchant.name,
    merchantUpdatedAt:
      card.merchant.updatedAt.toISOString(),

    categories: card.categories
      .map((item: any) => ({
        categoryId: item.categoryId,
        slug: item.category.slug,
        primary: item.primary,
        active: item.category.active,
      }))
      .sort((a: any, b: any) =>
        a.slug.localeCompare(b.slug),
      ),
  }));
}

async function buildFingerprint(prisma: any) {
  const cards = await loadTargets(prisma);

  return stableHash(targetMaterial(cards));
}

async function buildPlan(prisma: any) {
  const cards = await loadTargets(prisma);

  const occasions = await prisma.occasion.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  const occasionBySlug = new Map(
    occasions.map((item: any) => [
      item.slug,
      item,
    ]),
  );

  const requiredSlugs = new Set(
    Object.values(SAFE_BY_CATEGORY)
      .flat()
      .map((rule) => rule.slug),
  );

  const missingOccasions = [...requiredSlugs]
    .filter((slug) => !occasionBySlug.has(slug));

  if (missingOccasions.length) {
    throw new Error(
      `Missing/inactive occasions: ${missingOccasions.join(", ")}`,
    );
  }

  const actions: any[] = [];
  const reviews: any[] = [];

  for (const card of cards) {
    const primaries = card.categories.filter(
      (item: any) =>
        item.primary &&
        item.category.active,
    );

    if (primaries.length !== 1) {
      reviews.push({
        giftCardId: card.id,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        categorySlug: "",
        reason:
          `PRIMARY_CATEGORY_COUNT_${primaries.length}`,
      });

      continue;
    }

    const category = primaries[0].category;
    const rules =
      SAFE_BY_CATEGORY[category.slug];

    if (!rules?.length) {
      reviews.push({
        giftCardId: card.id,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,
        categorySlug: category.slug,
        reason:
          REVIEW_ONLY[category.slug] ??
          "NO_APPROVED_SEMANTIC_RULE",
      });

      continue;
    }

    for (const rule of rules) {
      const occasion =
        occasionBySlug.get(rule.slug);

      if (!occasion) {
        throw new Error(
          `Occasion disappeared: ${rule.slug}`,
        );
      }

      actions.push({
        type: "CREATE_OCCASION_RELATION",
        giftCardId: card.id,
        merchantName: card.merchant.name,
        giftCardTitle: card.title,

        categorySlug: category.slug,
        categoryName: category.name,

        occasionId: occasion.id,
        occasionSlug: occasion.slug,
        occasionName: occasion.name,

        relevance: rule.relevance,

        ruleId:
          `semantic-category-v8:${category.slug}:${rule.slug}`,

        actionId: stableHash([
          VERSION,
          card.id,
          category.slug,
          rule.slug,
          rule.relevance,
        ]),
      });
    }
  }

  const safeCardIds = new Set(
    actions.map((action) => action.giftCardId),
  );

  const byCategory = new Map<
    string,
    {
      cards: Set<string>;
      relations: number;
    }
  >();

  for (const action of actions) {
    const current =
      byCategory.get(action.categorySlug) ?? {
        cards: new Set<string>(),
        relations: 0,
      };

    current.cards.add(action.giftCardId);
    current.relations++;

    byCategory.set(
      action.categorySlug,
      current,
    );
  }

  const categorySummary =
    [...byCategory.entries()]
      .map(([category, value]) => ({
        category,
        safeCards: value.cards.size,
        relations: value.relations,
      }))
      .sort(
        (a, b) =>
          b.safeCards - a.safeCards ||
          a.category.localeCompare(b.category),
      );

  const planBase = {
    version: VERSION,
    mode: "PREVIEW",

    generatedAt:
      new Date().toISOString(),

    targetFingerprint:
      stableHash(targetMaterial(cards)),

    targetCards: cards.length,

    safeCards: safeCardIds.size,

    reviewCards: reviews.length,

    safeRelations: actions.length,

    projectedRemainingWithoutOccasion:
      cards.length - safeCardIds.size,

    categorySummary,

    actions,
    reviews,
  };

  return {
    ...planBase,
    planId: stableHash(planBase),
  };
}

function readPlan() {
  if (!PLAN_ID_ARG) {
    throw new Error(
      "Missing --plan-id=<exact preview plan id>",
    );
  }

  if (!fs.existsSync(PLAN_JSON)) {
    throw new Error(
      `Missing plan: ${PLAN_JSON}`,
    );
  }

  const plan =
    JSON.parse(
      fs.readFileSync(
        PLAN_JSON,
        "utf8",
      ),
    );

  if (plan.version !== VERSION) {
    throw new Error(
      `Wrong plan version: ${plan.version}`,
    );
  }

  if (plan.planId !== PLAN_ID_ARG) {
    throw new Error(
      "Plan ID does not match preview.",
    );
  }

  const {
    planId: _planId,
    ...material
  } = plan;

  if (stableHash(material) !== plan.planId) {
    throw new Error(
      "Saved plan hash is invalid.",
    );
  }

  return plan;
}

async function preview(prisma: any) {
  const plan =
    await buildPlan(prisma);

  fs.mkdirSync(
    REPORT_DIR,
    { recursive: true },
  );

  fs.writeFileSync(
    PLAN_JSON,
    JSON.stringify(plan, null, 2) + "\n",
    "utf8",
  );

  const headers = [
    "status",
    "giftCardId",
    "merchantName",
    "giftCardTitle",
    "categorySlug",
    "occasionSlug",
    "relevance",
    "reason",
    "ruleId",
  ];

  const rows = [
    ...plan.actions.map(
      (action: any) => ({
        status: "SAFE",
        giftCardId:
          action.giftCardId,
        merchantName:
          action.merchantName,
        giftCardTitle:
          action.giftCardTitle,
        categorySlug:
          action.categorySlug,
        occasionSlug:
          action.occasionSlug,
        relevance:
          action.relevance,
        reason: "",
        ruleId:
          action.ruleId,
      }),
    ),

    ...plan.reviews.map(
      (review: any) => ({
        status: "REVIEW",
        giftCardId:
          review.giftCardId,
        merchantName:
          review.merchantName,
        giftCardTitle:
          review.giftCardTitle,
        categorySlug:
          review.categorySlug,
        occasionSlug: "",
        relevance: "",
        reason:
          review.reason,
        ruleId: "",
      }),
    ),
  ];

  fs.writeFileSync(
    PLAN_CSV,
    "\uFEFF" +
      [
        headers.join(","),
        ...rows.map(
          (row) =>
            headers
              .map((key) =>
                csvEscape(
                  (row as any)[key],
                ),
              )
              .join(","),
        ),
      ].join("\n") +
      "\n",
    "utf8",
  );

  console.log("");
  console.log(
    "Dorokartes Occasion Semantic Backfill v8 — PREVIEW",
  );

  console.log(
    `Plan ID: ${plan.planId}`,
  );

  console.log(
    `Targets without occasion: ${plan.targetCards}`,
  );

  console.log(
    `SAFE cards: ${plan.safeCards}`,
  );

  console.log(
    `SAFE relations: ${plan.safeRelations}`,
  );

  console.log(
    `REVIEW cards: ${plan.reviewCards}`,
  );

  console.log(
    `Projected remaining without occasion: ${plan.projectedRemainingWithoutOccasion}`,
  );

  console.log("");
  console.log(
    "=== SAFE BY CATEGORY ===",
  );

  console.table(
    plan.categorySummary,
  );

  console.log("");
  console.log(
    "=== REVIEW CARDS ===",
  );

  console.table(
    plan.reviews.slice(0, 100),
  );

  console.log("");
  console.log(
    `PLAN: ${PLAN_JSON}`,
  );

  console.log(
    `CSV: ${PLAN_CSV}`,
  );

  console.log("");
  console.log(
    "PREVIEW ONLY — database unchanged.",
  );
}

async function applyPlan(prisma: any) {
  const plan = readPlan();

  const currentFingerprint =
    await buildFingerprint(prisma);

  if (
    currentFingerprint !==
    plan.targetFingerprint
  ) {
    throw new Error(
      "Catalog/occasion target state changed after preview. Generate a fresh preview.",
    );
  }

  if (!plan.actions.length) {
    throw new Error(
      "Plan contains zero SAFE actions.",
    );
  }

  const beforeRelations =
    await prisma.giftCardOccasion.count();

  await prisma.$transaction(
    async (tx: any) => {
      await tx.giftCardOccasion.createMany({
        data: plan.actions.map(
          (action: any) => ({
            giftCardId:
              action.giftCardId,
            occasionId:
              action.occasionId,
            relevance:
              action.relevance,
          }),
        ),
      });
    },
    {
      maxWait: 15000,
      timeout: 120000,
    },
  );

  const afterRelations =
    await prisma.giftCardOccasion.count();

  const remainingWithoutOccasion =
    await prisma.giftCard.count({
      where: {
        status: "ACTIVE",
        merchant: {
          status: "ACTIVE",
        },
        occasions: {
          none: {},
        },
      },
    });

  const report = {
    version: VERSION,
    mode: "APPLY",
    planId: plan.planId,
    appliedAt:
      new Date().toISOString(),

    appliedRelations:
      plan.actions.length,

    newlyCoveredCards:
      plan.safeCards,

    beforeRelations,
    afterRelations,

    remainingWithoutOccasion,
  };

  fs.writeFileSync(
    APPLY_JSON,
    JSON.stringify(
      report,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log(
    "Dorokartes Occasion Semantic Backfill v8 — APPLY",
  );

  console.log(
    `Applied relations: ${report.appliedRelations}`,
  );

  console.log(
    `Relations: ${beforeRelations} -> ${afterRelations}`,
  );

  console.log(
    `Newly covered cards: ${report.newlyCoveredCards}`,
  );

  console.log(
    `Remaining without occasion: ${remainingWithoutOccasion}`,
  );
}

async function postAudit(prisma: any) {
  const plan = readPlan();

  if (!fs.existsSync(APPLY_JSON)) {
    throw new Error(
      `Missing apply report: ${APPLY_JSON}`,
    );
  }

  const applyReport =
    JSON.parse(
      fs.readFileSync(
        APPLY_JSON,
        "utf8",
      ),
    );

  if (
    applyReport.planId !==
    plan.planId
  ) {
    throw new Error(
      "Apply report belongs to another plan.",
    );
  }

  const cardIds = [
    ...new Set(
      plan.actions.map(
        (x: any) =>
          x.giftCardId,
      ),
    ),
  ];

  const rows =
    await prisma.giftCardOccasion.findMany({
      where: {
        giftCardId: {
          in: cardIds,
        },
      },

      select: {
        giftCardId: true,
        occasionId: true,
        relevance: true,
      },
    });

  const failed =
    plan.actions.filter(
      (action: any) =>
        !rows.some(
          (row: any) =>
            row.giftCardId ===
              action.giftCardId &&
            row.occasionId ===
              action.occasionId &&
            row.relevance ===
              action.relevance,
        ),
    );

  const remainingWithoutOccasion =
    await prisma.giftCard.count({
      where: {
        status: "ACTIVE",
        merchant: {
          status: "ACTIVE",
        },
        occasions: {
          none: {},
        },
      },
    });

  const report = {
    version: VERSION,
    mode: "POST_AUDIT",

    planId: plan.planId,

    auditedAt:
      new Date().toISOString(),

    checkedRelations:
      plan.actions.length,

    passedRelations:
      plan.actions.length -
      failed.length,

    failedRelations:
      failed.map(
        (x: any) =>
          x.actionId,
      ),

    expectedRemainingWithoutOccasion:
      plan.projectedRemainingWithoutOccasion,

    actualRemainingWithoutOccasion:
      remainingWithoutOccasion,

    pass:
      failed.length === 0 &&
      remainingWithoutOccasion ===
        plan.projectedRemainingWithoutOccasion,
  };

  fs.writeFileSync(
    POST_AUDIT_JSON,
    JSON.stringify(
      report,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log(
    "Dorokartes Occasion Semantic Backfill v8 — POST AUDIT",
  );

  console.log(
    `Relations: ${report.passedRelations}/${report.checkedRelations}`,
  );

  console.log(
    `Remaining without occasion: ${remainingWithoutOccasion}`,
  );

  console.log(
    `PASS: ${report.pass}`,
  );

  if (!report.pass) {
    process.exitCode = 1;
  }
}

async function main() {
  if (APPLY && POST_AUDIT) {
    throw new Error(
      "--apply and --post-audit cannot be combined.",
    );
  }

  const { prisma } =
    await import("../../lib/prisma");

  try {
    if (APPLY) {
      await applyPlan(prisma);
    } else if (POST_AUDIT) {
      await postAudit(prisma);
    } else {
      await preview(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
