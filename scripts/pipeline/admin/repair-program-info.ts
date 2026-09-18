import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
  RediscoveryTaskStatus,
  VerificationAttemptResult,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDomain } from "tldts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const THRESHOLD = 0.97;

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function reasonCodes(value: unknown) {
  return Array.isArray(value)
    ? value.map((x) => String(x).toUpperCase())
    : [];
}

function hasProgramEvidence(value: unknown) {
  const codes = reasonCodes(value);
  return codes.some((code) =>
    [
      "DIRECT_GIFT_CARD_PROGRAM",
      "MERCHANT_GIFT_CARD_PROGRAM_EVIDENCE",
      "MERCHANT_PROGRAM_CONFIRMED",
      "PHYSICAL_CARD_EVIDENCE",
      "PHYSICAL_PURCHASE_ONLY",
      "IN_STORE_PURCHASE_ONLY",
      "PURCHASE_LINK_PRESENT",
      "GIFT_CARD_PROGRAM_EVIDENCE",
    ].some((signal) => code.includes(signal))
  );
}

async function siblingVerified(itemId: string, url: string) {
  const domain = domainOf(url);
  const rows = await prisma.discoveryItem.findMany({
    where: {
      id: { not: itemId },
      status: DiscoveryStatus.VERIFIED,
    },
    select: { sourceUrl: true },
  });

  return rows.some((x) => {
    try { return domainOf(x.sourceUrl) === domain; } catch { return false; }
  });
}

async function ensureRediscovery(item: any, role: string, codes: string[]) {
  const domain = domainOf(item.sourceUrl);

  const existing = await prisma.domainRediscoveryTask.findFirst({
    where: {
      merchantDomain: domain,
      status: {
        in: [
          RediscoveryTaskStatus.PENDING,
          RediscoveryTaskStatus.RUNNING,
          RediscoveryTaskStatus.MANUAL_REVIEW,
        ],
      },
    },
  });

  if (existing) return;

  await prisma.domainRediscoveryTask.create({
    data: {
      merchantDomain: domain,
      merchantName: item.merchantName,
      triggerUrl: item.sourceUrl,
      triggerReason: `PROGRAM_INFO_${role}:${codes.join(",")}`,
      status: RediscoveryTaskStatus.PENDING,
    },
  });
}

async function main() {
  console.log("Dorokartes Program-Info Repair");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  const rejected = await prisma.discoveryItem.findMany({
    where: { status: DiscoveryStatus.REJECTED },
    orderBy: { processedAt: "desc" },
  });

  let eligible = 0;

  for (const item of rejected) {
    const attempt = await prisma.discoveryVerificationAttempt.findFirst({
      where: { discoveryItemId: item.id },
      orderBy: { checkedAt: "desc" },
    });

    if (!attempt) continue;
    if (!["TERMS", "CONTENT", "GIFT_GUIDE", "PROMOTION"].includes(String(attempt.pageRole))) continue;
    if ((attempt.confidence ?? 0) < THRESHOLD) continue;
    if (!hasProgramEvidence(attempt.reasonCodes)) continue;
    if (await siblingVerified(item.id, item.sourceUrl)) continue;

    eligible++;
    const codes = reasonCodes(attempt.reasonCodes);

    console.log(`[RESTORE PROGRAM INFO] ${item.merchantName ?? item.sourceName}`);
    console.log(`  ${item.sourceUrl}`);
    console.log(`  role=${attempt.pageRole} confidence=${attempt.confidence}`);
    console.log(`  reasons=${codes.join(",")}`);

    if (APPLY) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: DiscoveryStatus.QUEUED,
          processedAt: null,
          notes:
            `${item.notes ?? ""}${item.notes ? " | " : ""}` +
            "PROGRAM_INFO_REPAIR: real merchant gift-card program retained for canonical rediscovery.",
        },
      });

      await prisma.discoveryVerificationAttempt.update({
        where: { id: attempt.id },
        data: {
          result: VerificationAttemptResult.AMBIGUOUS,
        },
      });

      await ensureRediscovery(item, String(attempt.pageRole), codes);
    }

    console.log("");
  }

  console.log("====================================");
  console.log(`Program-info rows eligible for restore: ${eligible}`);
  if (!APPLY) console.log("Dry run only. No rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
