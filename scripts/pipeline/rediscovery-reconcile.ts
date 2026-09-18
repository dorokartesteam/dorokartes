import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
  RediscoveryTaskStatus,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDomain } from "tldts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

async function main() {
  const tasks = await prisma.domainRediscoveryTask.findMany({
    where: {
      status: {
        in: [
          RediscoveryTaskStatus.PENDING,
          RediscoveryTaskStatus.RUNNING,
          RediscoveryTaskStatus.MANUAL_REVIEW,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("Dorokartes Rediscovery Reconcile");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  let resolvable = 0;

  for (const task of tasks) {
    const verified = await prisma.discoveryItem.findMany({
      where: {
        status: DiscoveryStatus.VERIFIED,
        sourceUrl: { not: task.triggerUrl },
      },
      orderBy: { processedAt: "desc" },
    });

    const replacement = verified.find(
      (item) => domainOf(item.sourceUrl) === task.merchantDomain.toLowerCase(),
    );

    if (!replacement) {
      console.log(
        `[OPEN] ${task.merchantName ?? task.merchantDomain} - no verified replacement`,
      );
      continue;
    }

    resolvable++;

    console.log(
      `[RESOLVABLE] ${task.merchantName ?? task.merchantDomain}`,
    );
    console.log(`  ${replacement.sourceUrl}`);

    if (APPLY) {
      await prisma.domainRediscoveryTask.update({
        where: { id: task.id },
        data: {
          status: RediscoveryTaskStatus.RESOLVED,
          resolvedUrl: replacement.sourceUrl,
          lastAttemptAt: new Date(),
        },
      });
    }
  }

  console.log("");
  console.log(`Resolvable tasks: ${resolvable}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
