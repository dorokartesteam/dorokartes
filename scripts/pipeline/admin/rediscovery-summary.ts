
import "dotenv/config";
import { PrismaClient, RediscoveryTaskStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const tasks = await prisma.domainRediscoveryTask.findMany({
    where: { status: { in: [
      RediscoveryTaskStatus.PENDING,
      RediscoveryTaskStatus.RUNNING,
      RediscoveryTaskStatus.MANUAL_REVIEW
    ] } },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Open rediscovery tasks: ${tasks.length}`);
  for (const t of tasks) {
    console.log(`[${t.status}] ${t.merchantName ?? t.merchantDomain}`);
    console.log(`  domain: ${t.merchantDomain}`);
    console.log(`  candidate: ${t.triggerUrl}`);
    console.log(`  reason: ${t.triggerReason}`);
  }
}
main().finally(async () => prisma.$disconnect());
