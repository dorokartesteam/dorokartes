import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
  RediscoveryTaskStatus,
  VerificationPageRole,
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
const NON_CANONICAL_ROLES = new Set<string>([
  "TERMS",
  "CONTENT",
  "GIFT_GUIDE",
  "PROMOTION",
]);

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

async function verifiedSiblingExists(itemId: string, sourceUrl: string) {
  const domain = domainOf(sourceUrl);

  const siblings = await prisma.discoveryItem.findMany({
    where: {
      id: { not: itemId },
      status: DiscoveryStatus.VERIFIED,
    },
    select: { sourceUrl: true },
  });

  return siblings.some((s) => {
    try {
      return domainOf(s.sourceUrl) === domain;
    } catch {
      return false;
    }
  });
}

async function main() {
  console.log("Dorokartes Queue Reconcile v1");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  const queued = await prisma.discoveryItem.findMany({
    where: { status: DiscoveryStatus.QUEUED },
    orderBy: { discoveredAt: "asc" },
  });

  let retireCandidates = 0;
  let rediscoveryResolvable = 0;

  for (const item of queued) {
    const latest = await prisma.discoveryVerificationAttempt.findFirst({
      where: { discoveryItemId: item.id },
      orderBy: { checkedAt: "desc" },
      select: {
        id: true,
        pageRole: true,
        confidence: true,
        checkedAt: true,
      },
    });

    if (!latest) continue;

    const role = String(latest.pageRole ?? "");
    const confidence = latest.confidence ?? 0;

    if (!NON_CANONICAL_ROLES.has(role) || confidence < THRESHOLD) {
      continue;
    }

    retireCandidates++;
    const siblingVerified = await verifiedSiblingExists(item.id, item.sourceUrl);

    console.log(`[NON_CANONICAL] ${item.merchantName ?? item.sourceName}`);
    console.log(`  ${item.sourceUrl}`);
    console.log(`  role=${role} confidence=${confidence}`);
    console.log(`  verified sibling on domain=${siblingVerified}`);

    if (APPLY) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: DiscoveryStatus.REJECTED,
          processedAt: new Date(),
          notes:
            `${item.notes ?? ""}${item.notes ? " | " : ""}` +
            `QUEUE_RECONCILE: high-confidence non-canonical ${role} (${confidence}).`,
        },
      });
    }

    console.log("");
  }

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

  for (const task of tasks) {
    const trigger = await prisma.discoveryItem.findFirst({
      where: { sourceUrl: task.triggerUrl },
      orderBy: { createdAt: "asc" },
      select: { id: true, sourceUrl: true },
    });

    if (!trigger) continue;

    const siblingVerified = await verifiedSiblingExists(
      trigger.id,
      trigger.sourceUrl,
    );

    if (!siblingVerified) continue;

    rediscoveryResolvable++;

    console.log(`[REDISCOVERY RESOLVABLE] ${task.merchantName ?? task.merchantDomain}`);
    console.log(`  ${task.triggerUrl}`);
    console.log("  reason=verified sibling already exists on same domain");

    if (APPLY) {
      await prisma.domainRediscoveryTask.update({
        where: { id: task.id },
        data: {
          status: RediscoveryTaskStatus.RESOLVED,
          resolvedAt: new Date(),
          notes:
            `${task.notes ?? ""}${task.notes ? " | " : ""}` +
            "QUEUE_RECONCILE: resolved because a VERIFIED sibling exists on the same merchant domain.",
        },
      });
    }

    console.log("");
  }

  console.log("====================================");
  console.log(`Queued non-canonical rows eligible to retire: ${retireCandidates}`);
  console.log(`Rediscovery tasks eligible to resolve: ${rediscoveryResolvable}`);

  if (!APPLY) {
    console.log("Dry run only. No database rows changed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
