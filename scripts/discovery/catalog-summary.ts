import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const merchants = await prisma.merchant.findMany({
    include: {
      giftCards: {
        include: {
          variants: true,
          sources: true,
          verificationEvents: {
            orderBy: { checkedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  console.log("Dorokartes Production Catalog Summary");
  console.log("");
  console.log(`Merchants: ${merchants.length}`);
  console.log(
    `GiftCards: ${merchants.reduce((n, m) => n + m.giftCards.length, 0)}`,
  );
  console.log("");

  for (const merchant of merchants) {
    console.log(`[${merchant.status}] ${merchant.name}`);
    console.log(`  website: ${merchant.websiteUrl ?? "-"}`);

    for (const card of merchant.giftCards) {
      console.log(
        `  [${card.status}/${card.verificationStatus}] ${card.title}`,
      );
      console.log(`    ${card.officialUrl ?? "-"}`);
      console.log(
        `    variants=${card.variants.length} sources=${card.sources.length} lastVerified=${card.lastVerifiedAt?.toISOString() ?? "-"}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
