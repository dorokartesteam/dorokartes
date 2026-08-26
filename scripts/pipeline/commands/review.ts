import "dotenv/config";
import {
  PrismaClient,
  RediscoveryTaskStatus,
  ReviewFlagStatus,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const [flags, rediscovery, queued, attempts] = await Promise.all([
    prisma.productionReviewFlag.findMany({
      where: { status: ReviewFlagStatus.OPEN },
      include: { giftCard: { select: { title: true, officialUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.domainRediscoveryTask.findMany({
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
    }),
    prisma.discoveryItem.findMany({
      where: { status: DiscoveryStatus.QUEUED },
      orderBy: { discoveredAt: "asc" },
      take: 100,
    }),
    prisma.discoveryVerificationAttempt.findMany({
      orderBy: { checkedAt: "desc" },
      take: 20,
      include: {
        discoveryItem: {
          select: { merchantName: true, sourceUrl: true, status: true },
        },
      },
    }),
  ]);

  console.log("Dorokartes Review Queue");
  console.log("=======================");
  console.log(`Open production flags: ${flags.length}`);
  console.log(`Open rediscovery tasks: ${rediscovery.length}`);
  console.log(`Queued DiscoveryItems: ${queued.length}`);
  console.log("");

  if (flags.length) {
    console.log("PRODUCTION FLAGS");
    for (const flag of flags) {
      console.log(
        `[${flag.type}] ${flag.giftCard.title}: ${flag.oldValue ?? "-"} -> ${flag.newValue ?? "-"}`,
      );
      console.log(`  ${flag.reason}`);
    }
    console.log("");
  }

  if (rediscovery.length) {
    console.log("REDISCOVERY");
    for (const task of rediscovery) {
      console.log(`[${task.status}] ${task.merchantName ?? task.merchantDomain}`);
      console.log(`  ${task.triggerUrl}`);
      console.log(`  ${task.triggerReason}`);
    }
    console.log("");
  }

  if (queued.length) {
    console.log("QUEUED DISCOVERY");
    for (const item of queued.slice(0, 30)) {
      console.log(
        `${item.merchantName ?? item.sourceName} -> ${item.sourceUrl}`,
      );
    }
    if (queued.length > 30) console.log(`... +${queued.length - 30} more`);
    console.log("");
  }

  console.log("RECENT VERIFICATION");
  for (const a of attempts) {
    console.log(
      `[${a.discoveryItem.status}] ${a.discoveryItem.merchantName ?? "-"} ` +
      `method=${a.method} role=${a.pageRole} confidence=${a.confidence ?? "-"} ` +
      `tokens=${a.totalTokens ?? 0}`,
    );
    console.log(`  ${a.discoveryItem.sourceUrl}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
