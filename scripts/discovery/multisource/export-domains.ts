import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const output = resolve(
    process.cwd(),
    process.argv[2] ?? "data/discovery/domains-auto.txt",
  );

  const rows = await prisma.discoveryItem.findMany({
    where: {
      status: {
        in: ["DISCOVERED", "QUEUED", "VERIFYING"],
      },
      possibleOfficialUrl: {
        not: null,
      },
    },
    select: {
      possibleOfficialUrl: true,
    },
    orderBy: {
      discoveredAt: "desc",
    },
  });

  const domains = [
    ...new Set(
      rows
        .map((row) => row.possibleOfficialUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  await writeFile(output, `${domains.join("\n")}\n`, "utf-8");

  console.log(`Exported ${domains.length} unique official domains`);
  console.log(output);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
