import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
  PrismaClient,
  DiscoveryStatus,
  VerificationPageRole,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

type Candidate = {
  merchantName: string;
  candidateUrl: string;
  evidenceUrl: string;
  evidenceKind: string;
  evidenceSummary: string;
  expectedRole?: string;
};

async function main() {
  const parsed = JSON.parse(
    await readFile("data/pipeline/search-assisted-candidates.json", "utf8"),
  ) as { candidates: Candidate[] };

  const blocked = await prisma.discoveryItem.findMany({
    where: {
      sourceName: "External Search Discovery",
      status: DiscoveryStatus.QUEUED,
    },
  });

  console.log("Source-backed manual review helper");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  let eligible = 0;

  for (const item of blocked) {
    const c = parsed.candidates.find((x) => x.candidateUrl === item.sourceUrl);
    if (!c) continue;

    const role =
      c.expectedRole === "CHECKOUT"
        ? VerificationPageRole.CHECKOUT
        : VerificationPageRole.CANONICAL_PURCHASE;

    console.log(`[REVIEW] ${c.merchantName}`);
    console.log(`  ${c.candidateUrl}`);
    console.log(`  evidence=${c.evidenceSummary}`);
    console.log(`  proposed role=${role}`);

    eligible++;

    if (!APPLY) continue;

    await prisma.manualVerificationOverride.upsert({
      where: { sourceUrl: item.sourceUrl },
      update: {
        forcedStatus: DiscoveryStatus.VERIFIED,
        forcedPageRole: role,
        forcedMerchantName: c.merchantName,
        reason:
          `Source-backed human review from indexed official page. ${c.evidenceSummary}`,
        setBy: "source-backed-review",
        lockUntilContentChanges: false,
        active: true,
      },
      create: {
        sourceUrl: item.sourceUrl,
        forcedStatus: DiscoveryStatus.VERIFIED,
        forcedPageRole: role,
        forcedMerchantName: c.merchantName,
        reason:
          `Source-backed human review from indexed official page. ${c.evidenceSummary}`,
        setBy: "source-backed-review",
        lockUntilContentChanges: false,
        active: true,
      },
    });

    console.log("  -> MANUAL OVERRIDE CREATED");
  }

  console.log("");
  console.log(`Eligible queued source-backed candidates: ${eligible}`);
  if (!APPLY) {
    console.log("Dry run only. Review evidence before using --apply.");
  }
}

main().finally(async () => prisma.$disconnect());
