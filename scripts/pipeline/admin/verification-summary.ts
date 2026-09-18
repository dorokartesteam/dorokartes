import "dotenv/config";
import {
  PrismaClient,
  VerificationMethod,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const attempts = await prisma.discoveryVerificationAttempt.findMany({
    include: {
      discoveryItem: {
        select: {
          merchantName: true,
          sourceUrl: true,
          status: true,
        },
      },
    },
    orderBy: { checkedAt: "desc" },
    take: 200,
  });

  console.log(`Verification attempts: ${attempts.length}`);

  const byMethod = new Map<string, number>();
  for (const a of attempts) {
    byMethod.set(a.method, (byMethod.get(a.method) ?? 0) + 1);
  }

  for (const [method,count] of byMethod) console.log(`${method}: ${count}`);

  console.log("");
  for (const a of attempts.filter(x => x.method === VerificationMethod.LLM)) {
    console.log(
      `[${a.discoveryItem.status}] ${a.discoveryItem.merchantName ?? "-"} ` +
      `role=${a.pageRole} confidence=${a.confidence ?? "-"} -> ${a.discoveryItem.sourceUrl}`,
    );
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
