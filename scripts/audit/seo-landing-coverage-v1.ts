import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      giftCards: {
        where: {
          giftCard: {
            status: "ACTIVE",
          },
        },
        select: {
          giftCard: {
            select: {
              verificationStatus: true,
            },
          },
        },
      },
    },
  });

  const occasions = await prisma.occasion.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      giftCards: {
        where: {
          giftCard: {
            status: "ACTIVE",
          },
        },
        select: {
          giftCard: {
            select: {
              verificationStatus: true,
            },
          },
        },
      },
    },
  });

  console.log("\n=== CATEGORY COVERAGE ===");

  console.table(
    categories.map((item) => ({
      slug: item.slug,
      name: item.name,
      activeCards: item.giftCards.length,
      verifiedCards: item.giftCards.filter(
        (x) => x.giftCard.verificationStatus === "VERIFIED"
      ).length,
    }))
  );

  console.log("\n=== OCCASION COVERAGE ===");

  console.table(
    occasions.map((item) => ({
      slug: item.slug,
      name: item.name,
      activeCards: item.giftCards.length,
      verifiedCards: item.giftCards.filter(
        (x) => x.giftCard.verificationStatus === "VERIFIED"
      ).length,
    }))
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
