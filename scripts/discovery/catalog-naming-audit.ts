import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const suspicious = [
  "official website scanner",
  "official websites",
  "gift card",
  "giftcard",
  "scanner",
  "verifier",
];

async function main() {
  const merchants = await prisma.merchant.findMany({
    include: { giftCards: true },
    orderBy: { name: "asc" },
  });

  let problems = 0;

  console.log(`Merchants: ${merchants.length}`);
  console.log("");

  for (const merchant of merchants) {
    const name = merchant.name.toLowerCase();
    const bad = suspicious.some((token) => name.includes(token));

    if (bad) {
      problems++;
      console.log(`[CHECK] ${merchant.name} (${merchant.slug})`);
      console.log(`  ${merchant.websiteUrl ?? "-"}`);
      for (const card of merchant.giftCards) {
        console.log(`  - ${card.title} (${card.slug})`);
      }
    }
  }

  if (problems === 0) {
    console.log("Catalog naming audit: OK");
  } else {
    console.log("");
    console.log(`Suspicious merchant names: ${problems}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
