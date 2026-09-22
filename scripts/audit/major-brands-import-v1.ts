import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

type BrandSpec = {
  name: string;
  slug: string;
  websiteUrl: string;
  officialDomains: string[];
  cardTitle: string;
  cardSlug: string;
  officialUrl: string;
};

const BRANDS: BrandSpec[] = [
  {
    name: "Nike",
    slug: "nike",
    websiteUrl: "https://www.nike.com/gr/",
    officialDomains: ["nike.com"],
    cardTitle: "Nike Gift Card",
    cardSlug: "nike-gift-card",
    officialUrl: "https://www.nike.com/gr/t/%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%B1%CF%81%CF%84%CE%B1-2F6OXBmk/GIFTCARD-8089",
  },
  {
    name: "Zara",
    slug: "zara",
    websiteUrl: "https://www.zara.com/gr/",
    officialDomains: ["zara.com"],
    cardTitle: "Zara Gift Card",
    cardSlug: "zara-gift-card",
    officialUrl: "https://www.zara.com/gr/el/%CE%B4%CF%89%CF%81%CE%BF%CE%BA%CE%B1%CF%81%CF%84%CE%B1-pT9057969516.html",
  },
  {
    name: "H&M",
    slug: "h-m",
    websiteUrl: "https://www2.hm.com/el_gr/",
    officialDomains: ["hm.com"],
    cardTitle: "H&M Gift Card",
    cardSlug: "h-m-gift-card",
    officialUrl: "https://www2.hm.com/el_gr/customer-service/gift-card.html",
  },
  {
    name: "Bershka",
    slug: "bershka",
    websiteUrl: "https://www.bershka.com/gr/",
    officialDomains: ["bershka.com"],
    cardTitle: "Bershka Gift Card",
    cardSlug: "bershka-gift-card",
    officialUrl: "https://www.bershka.com/gr/gift-card.html",
  },
  {
    name: "Pull&Bear",
    slug: "pull-and-bear",
    websiteUrl: "https://www.pullandbear.com/gr/",
    officialDomains: ["pullandbear.com"],
    cardTitle: "Pull&Bear Gift Card",
    cardSlug: "pull-and-bear-gift-card",
    officialUrl: "https://www.pullandbear.com/gr/en/page/services.html",
  },
  {
    name: "Stradivarius",
    slug: "stradivarius",
    websiteUrl: "https://www.stradivarius.com/gr/",
    officialDomains: ["stradivarius.com"],
    cardTitle: "Stradivarius Gift Card",
    cardSlug: "stradivarius-gift-card",
    officialUrl: "https://www.stradivarius.com/gr/en/women/clothing/gift-card-n4804",
  },
  {
    name: "Oysho",
    slug: "oysho",
    websiteUrl: "https://www.oysho.com/gr/",
    officialDomains: ["oysho.com"],
    cardTitle: "Oysho Gift Card",
    cardSlug: "oysho-gift-card",
    officialUrl: "https://www.oysho.com/gr/gift-card/physical.html",
  },
  {
    name: "Massimo Dutti",
    slug: "massimo-dutti",
    websiteUrl: "https://www.massimodutti.com/gr/",
    officialDomains: ["massimodutti.com"],
    cardTitle: "Massimo Dutti Gift Card",
    cardSlug: "massimo-dutti-gift-card",
    officialUrl: "https://www.massimodutti.com/gr/gift-card/virtual",
  },
  {
    name: "Zara Home",
    slug: "zara-home",
    websiteUrl: "https://www.zarahome.com/gr/",
    officialDomains: ["zarahome.com"],
    cardTitle: "Zara Home Gift Card",
    cardSlug: "zara-home-gift-card",
    officialUrl: "https://www.zarahome.com/gr/virtual-card.html",
  },
];

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9α-ω]+/gi, "");
}

function host(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(value: string | null | undefined, domains: string[]) {
  const h = host(value);
  if (!h) return false;
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function buildPlan() {
  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      websiteUrl: true,
    },
  });

  const cards = await prisma.giftCard.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
      merchantId: true,
    },
  });

  const rows = BRANDS.map((spec) => {
    const merchantConflicts = merchants.filter((m) =>
      normalizeName(m.name) === normalizeName(spec.name) ||
      m.slug === spec.slug ||
      hostMatches(m.websiteUrl, spec.officialDomains),
    );

    const cardConflicts = cards.filter((c) =>
      c.slug === spec.cardSlug ||
      c.officialUrl === spec.officialUrl,
    );

    const action =
      merchantConflicts.length === 0 && cardConflicts.length === 0
        ? "CREATE"
        : "SKIP_CONFLICT";

    return {
      spec,
      action,
      merchantConflicts,
      cardConflicts,
    };
  });

  const canonical = rows.map((r) => ({
    name: r.spec.name,
    slug: r.spec.slug,
    websiteUrl: r.spec.websiteUrl,
    cardTitle: r.spec.cardTitle,
    cardSlug: r.spec.cardSlug,
    officialUrl: r.spec.officialUrl,
    action: r.action,
    merchantConflictIds: r.merchantConflicts.map((m) => m.id).sort(),
    cardConflictIds: r.cardConflicts.map((c) => c.id).sort(),
  }));

  return {
    generatedAt: new Date().toISOString(),
    rows,
    planId: stableHash(canonical),
    createCount: rows.filter((r) => r.action === "CREATE").length,
    skipCount: rows.filter((r) => r.action !== "CREATE").length,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const planArg = args.find((a) => a.startsWith("--plan-id="));
  return {
    apply,
    planId: planArg?.slice("--plan-id=".length) ?? null,
  };
}

async function main() {
  const { apply, planId } = parseArgs();
  const plan = await buildPlan();

  const outDir = path.join(process.cwd(), "reports", "postlaunch");
  fs.mkdirSync(outDir, { recursive: true });

  const previewPath = path.join(
    outDir,
    apply ? "major-brands-import-v1-apply-plan.json" : "major-brands-import-v1-preview.json",
  );
  fs.writeFileSync(previewPath, JSON.stringify(plan, null, 2) + "\n", "utf8");

  console.log("Dorokartes Major Brands Import v1");
  console.log("=================================");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`CREATE: ${plan.createCount}`);
  console.log(`SKIP/CONFLICT: ${plan.skipCount}`);
  console.log("");

  for (const row of plan.rows) {
    console.log(`${row.spec.name.padEnd(16)} ${row.action}`);
    if (row.merchantConflicts.length) {
      console.log(
        `  merchant conflicts: ${row.merchantConflicts
          .map((m) => `${m.name}#${m.id}`)
          .join(", ")}`,
      );
    }
    if (row.cardConflicts.length) {
      console.log(
        `  card conflicts: ${row.cardConflicts
          .map((c) => `${c.title}#${c.id}`)
          .join(", ")}`,
      );
    }
  }

  if (!apply) {
    console.log("");
    console.log(`Preview: ${previewPath}`);
    console.log("PREVIEW ONLY — database unchanged.");
    console.log("");
    console.log("To apply this exact plan:");
    console.log(
      `npx tsx scripts/audit/major-brands-import-v1.ts --apply --plan-id=${plan.planId}`,
    );
    return;
  }

  if (!planId) {
    throw new Error("Missing --plan-id=...");
  }

  if (planId !== plan.planId) {
    throw new Error(
      `Plan ID mismatch. Expected current ${plan.planId}, received ${planId}. Re-run preview.`,
    );
  }

  const createRows = plan.rows.filter((r) => r.action === "CREATE");
  if (!createRows.length) {
    console.log("No CREATE actions remain. Nothing written.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const created: Array<{
      merchantId: string;
      merchantName: string;
      cardId: string;
      cardTitle: string;
    }> = [];

    for (const row of createRows) {
      const spec = row.spec;

      // Re-check exact guards inside transaction.
      const merchantConflict = await tx.merchant.findFirst({
        where: {
          OR: [
            { slug: spec.slug },
            { name: { equals: spec.name, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true },
      });

      if (merchantConflict) {
        throw new Error(
          `ABORT: merchant conflict appeared for ${spec.name}: ${merchantConflict.id}`,
        );
      }

      const cardConflict = await tx.giftCard.findFirst({
        where: {
          OR: [
            { slug: spec.cardSlug },
            { officialUrl: spec.officialUrl },
          ],
        },
        select: { id: true, title: true },
      });

      if (cardConflict) {
        throw new Error(
          `ABORT: gift-card conflict appeared for ${spec.name}: ${cardConflict.id}`,
        );
      }

      const merchant = await tx.merchant.create({
        data: {
          name: spec.name,
          slug: spec.slug,
          status: "ACTIVE",
          websiteUrl: spec.websiteUrl,
        },
        select: { id: true, name: true },
      });

      const card = await tx.giftCard.create({
        data: {
          merchantId: merchant.id,
          title: spec.cardTitle,
          slug: spec.cardSlug,
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          officialUrl: spec.officialUrl,
        },
        select: { id: true, title: true },
      });

      created.push({
        merchantId: merchant.id,
        merchantName: merchant.name,
        cardId: card.id,
        cardTitle: card.title,
      });
    }

    return created;
  });

  const applyReport = {
    appliedAt: new Date().toISOString(),
    planId: plan.planId,
    created: result,
  };

  const applyPath = path.join(outDir, "major-brands-import-v1-apply.json");
  fs.writeFileSync(applyPath, JSON.stringify(applyReport, null, 2) + "\n", "utf8");

  console.log("");
  console.log(`APPLIED: ${result.length} merchants + ${result.length} gift cards`);
  console.log(`Report: ${applyPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
