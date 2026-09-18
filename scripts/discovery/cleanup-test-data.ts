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

const fakeHosts = [
  "example.gr",
  "examplespa.gr",
  "retailer.gr",
  "example.com",
  "example-business.gr",
];

async function main() {
  const items = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      sourceUrl: true,
      possibleOfficialUrl: true,
      merchantName: true,
    },
  });

  const ids = items
    .filter((item) => {
      const combined = `${item.sourceUrl} ${item.possibleOfficialUrl ?? ""}`.toLowerCase();
      return fakeHosts.some((host) => combined.includes(host));
    })
    .map((item) => item.id);

  if (ids.length === 0) {
    console.log("No test DiscoveryItem rows found.");
    return;
  }

  const result = await prisma.discoveryItem.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  console.log(`Deleted ${result.count} test DiscoveryItem row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
