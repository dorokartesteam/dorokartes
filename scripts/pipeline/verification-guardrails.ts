import type { PrismaClient, VerificationPageRole } from "../../src/generated/prisma/client";

export async function logHashComparison(
  prisma: PrismaClient,
  discoveryItemId: string,
  currentHash: string | null,
) {
  const previous = await prisma.verificationFetchObservation.findFirst({
    where: { discoveryItemId },
    orderBy: { observedAt: "desc" },
  });

  if (!previous?.contentHash) {
    console.log(`  -> content hash: NEW ${currentHash ?? "-"}`);
    return { state: "NEW" as const };
  }

  if (previous.contentHash === currentHash) {
    console.log(`  -> content hash: SAME ${currentHash}`);
    return { state: "SAME" as const };
  }

  console.log("  -> content hash: CHANGED");
  console.log(`     previous=${previous.contentHash}`);
  console.log(`     current =${currentHash ?? "-"}`);
  return { state: "CHANGED" as const };
}

export async function recordFetchObservation(
  prisma: PrismaClient,
  data: {
    discoveryItemId: string;
    preflightKind: string;
    contentHash: string | null;
    httpStatus: number | null;
    fetchTier: string | null;
  },
) {
  await prisma.verificationFetchObservation.create({ data });
}

export async function getFetchStability(
  prisma: PrismaClient,
  discoveryItemId: string,
  required = 3,
  minSpacingMinutes = 2,
) {
  const observations = await prisma.verificationFetchObservation.findMany({
    where: { discoveryItemId },
    orderBy: { observedAt: "desc" },
    take: 12,
  });

  if (observations.length < required) {
    return { stable: false, reason: "NOT_ENOUGH_OBSERVATIONS", count: observations.length };
  }

  const selected = [];
  for (const obs of observations) {
    if (selected.length === 0) {
      selected.push(obs);
      continue;
    }
    const last = selected[selected.length - 1];
    const deltaMs = last.observedAt.getTime() - obs.observedAt.getTime();
    if (deltaMs >= minSpacingMinutes * 60_000) selected.push(obs);
    if (selected.length >= required) break;
  }

  if (selected.length < required) {
    return { stable: false, reason: "SPACING_NOT_MET", count: selected.length };
  }

  const kinds = selected.map((x) => x.preflightKind);
  return {
    stable: new Set(kinds).size === 1,
    reason: new Set(kinds).size === 1 ? "STABLE" : "UNSTABLE_FETCH",
    count: selected.length,
    kinds,
  };
}

export async function guardProductionRoleChange(
  prisma: PrismaClient,
  args: {
    officialUrl: string;
    newRole: VerificationPageRole;
  },
) {
  const card = await prisma.giftCard.findFirst({
    where: {
      officialUrl: args.officialUrl,
      verificationStatus: "VERIFIED",
      status: "ACTIVE",
    },
    include: {
      verificationEvents: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!card) return { blocked: false, previousRole: null };

  const previousRole =
    (card.verificationEvents[0]?.notes ?? "").match(/role=([A-Z_]+)/)?.[1] ?? null;

  if (!previousRole || previousRole === args.newRole) {
    return { blocked: false, previousRole };
  }

  const existing = await prisma.productionReviewFlag.findFirst({
    where: {
      giftCardId: card.id,
      type: "ROLE_CHANGED",
      status: "OPEN",
      newValue: args.newRole,
    },
  });

  if (!existing) {
    await prisma.productionReviewFlag.create({
      data: {
        giftCardId: card.id,
        type: "ROLE_CHANGED",
        oldValue: previousRole,
        newValue: args.newRole,
        reason: `Production role changed from ${previousRole} to ${args.newRole}. Human review required.`,
      },
    });
  }

  return { blocked: true, previousRole };
}
