import "dotenv/config";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCORING_CONFIG, SCORING_MODEL_KEY } from "../core/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const overrides = [
  {
    merchantDomain: "skyexpress.gr",
    forcedUrl: "https://www.skyexpress.gr/el/book/sky-gift",
    forcedMerchantName: "SKY express",
    reason: "Prefer stable Greek gift-card landing page.",
    setBy: "pipeline-bootstrap",
  },
  {
    merchantDomain: "atticadps.gr",
    forcedUrl: "https://www.atticadps.gr/attica-dwrokarta/",
    forcedMerchantName: "attica",
    reason: "Prefer dedicated Greek gift-card page.",
    setBy: "pipeline-bootstrap",
  },
  {
    merchantDomain: "ikea.gr",
    forcedUrl: "https://www.ikea.gr/agora-dorokartas-ikea/",
    forcedMerchantName: "IKEA",
    reason: "Use current Greek gift-card landing page instead of terms PDF.",
    setBy: "pipeline-bootstrap",
  },
  {
    merchantDomain: "prenatal.gr",
    forcedUrl: "https://prenatal.gr/gift-card",
    forcedMerchantName: "Prenatal",
    reason: "Lock clean merchant identity and canonical URL.",
    setBy: "pipeline-bootstrap",
  },
];

async function main() {
  await prisma.scoringModelVersion.upsert({
    where: { key: SCORING_MODEL_KEY },
    update: {
      description: "Stable canonical scoring model.",
      config: SCORING_CONFIG,
      active: true,
    },
    create: {
      key: SCORING_MODEL_KEY,
      description: "Stable canonical scoring model.",
      config: SCORING_CONFIG,
      active: true,
    },
  });

  await prisma.scoringModelVersion.updateMany({
    where: { key: { not: SCORING_MODEL_KEY } },
    data: { active: false },
  });

  for (const item of overrides) {
    await prisma.manualCanonicalOverride.upsert({
      where: { merchantDomain: item.merchantDomain },
      update: { ...item, active: true },
      create: { ...item, active: true },
    });
    console.log(`[OVERRIDE] ${item.merchantDomain}`);
  }

  console.log(`[SCORING] ${SCORING_MODEL_KEY}`);
}

main().finally(async () => prisma.$disconnect());
