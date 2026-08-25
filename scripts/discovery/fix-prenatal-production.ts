import "dotenv/config";
import {
  PrismaClient,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const badMerchant = await prisma.merchant.findUnique({
    where: { slug: "official-website-scanner" },
    include: { giftCards: true },
  });

  if (!badMerchant) {
    console.log("No merchant with slug official-website-scanner found.");
    return;
  }

  const existingPrenatal = await prisma.merchant.findUnique({
    where: { slug: "prenatal" },
  });

  if (existingPrenatal && existingPrenatal.id !== badMerchant.id) {
    throw new Error(
      `A different Prenatal merchant already exists (${existingPrenatal.id}). Aborting to avoid merge ambiguity.`,
    );
  }

  const updatedMerchant = await prisma.merchant.update({
    where: { id: badMerchant.id },
    data: {
      name: "Prenatal",
      slug: "prenatal",
      websiteUrl: "https://prenatal.gr",
    },
  });

  for (const card of badMerchant.giftCards) {
    const desiredSlug =
      badMerchant.giftCards.length === 1
        ? "prenatal-gift-card"
        : `prenatal-${card.id.slice(-6)}-gift-card`;

    await prisma.giftCard.update({
      where: { id: card.id },
      data: {
        title: "Prenatal Gift Card",
        slug: desiredSlug,
      },
    });
  }

  console.log(`[OK] Merchant renamed: ${updatedMerchant.name}`);
  console.log(`[OK] Merchant slug: ${updatedMerchant.slug}`);
  console.log(`[OK] Website: ${updatedMerchant.websiteUrl}`);
  console.log(`[OK] Updated gift cards: ${badMerchant.giftCards.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
