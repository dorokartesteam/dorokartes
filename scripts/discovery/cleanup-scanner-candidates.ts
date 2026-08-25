import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const before = await prisma.discoveryItem.count({
    where: {
      sourceName: "Official Website Verifier",
    },
  });

  console.log(`Scanner-generated DiscoveryItems found: ${before}`);

  if (before === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const result = await prisma.discoveryItem.deleteMany({
    where: {
      sourceName: "Official Website Verifier",
    },
  });

  console.log(`Deleted ${result.count} scanner-generated DiscoveryItems.`);
  console.log("Seeded/manual OFFICIAL rows were left untouched.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
