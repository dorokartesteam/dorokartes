
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient, DiscoveryStatus, VerificationPageRole } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const parsed = JSON.parse(await readFile("data/pipeline/manual-verification-overrides.json","utf8"));
  for (const x of parsed.overrides ?? []) {
    await prisma.manualVerificationOverride.upsert({
      where: { sourceUrl: x.sourceUrl },
      update: {
        forcedStatus: DiscoveryStatus[x.forcedStatus],
        forcedPageRole: VerificationPageRole[x.forcedPageRole],
        forcedMerchantName: x.forcedMerchantName ?? null,
        reason: x.reason,
        setBy: x.setBy,
        contentHash: x.contentHash ?? null,
        lockUntilContentChanges: x.lockUntilContentChanges ?? true,
        active: x.active ?? true
      },
      create: {
        sourceUrl: x.sourceUrl,
        forcedStatus: DiscoveryStatus[x.forcedStatus],
        forcedPageRole: VerificationPageRole[x.forcedPageRole],
        forcedMerchantName: x.forcedMerchantName ?? null,
        reason: x.reason,
        setBy: x.setBy,
        contentHash: x.contentHash ?? null,
        lockUntilContentChanges: x.lockUntilContentChanges ?? true,
        active: x.active ?? true
      }
    });
    console.log(`[MANUAL OVERRIDE] ${x.sourceUrl}`);
  }
  console.log(`Loaded: ${(parsed.overrides ?? []).length}`);
}
main().finally(async () => prisma.$disconnect());
