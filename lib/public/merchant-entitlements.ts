import { prisma } from "@/lib/prisma";

export type MerchantPublicTier = "PARTNER" | "FEATURED" | "PREMIUM_BANNER";

export type MerchantPublicSubscription = {
  plan: string;
  status: string;
  endsAt: Date | string | null;
} | null | undefined;

function endsInFuture(value: Date | string | null | undefined, now: Date) {
  if (!value) return true;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function merchantPublicTier(
  subscription: MerchantPublicSubscription,
  now = new Date(),
): MerchantPublicTier | null {
  if (!subscription || subscription.status !== "ACTIVE") return null;
  if (!endsInFuture(subscription.endsAt, now)) return null;

  if (subscription.plan === "PREMIUM_BANNER") return "PREMIUM_BANNER";
  if (subscription.plan === "FEATURED") return "FEATURED";
  if (subscription.plan === "PARTNER") return "PARTNER";

  return null;
}

export function merchantPromotionRank(subscription: MerchantPublicSubscription) {
  const tier = merchantPublicTier(subscription);
  if (tier === "PREMIUM_BANNER") return 2;
  if (tier === "FEATURED") return 1;
  return 0;
}

export function merchantPartnerBadge(tier: MerchantPublicTier | null) {
  if (!tier) return null;
  if (tier === "PREMIUM_BANNER") return "Premium Partner";
  if (tier === "FEATURED") return "Featured Partner";
  return "Dorokartes Partner";
}

export async function getPromotedMerchantBuckets() {
  const now = new Date();
  const subscriptions = await prisma.merchantSubscription.findMany({
    where: {
      status: "ACTIVE",
      plan: { in: ["FEATURED", "PREMIUM_BANNER"] },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      merchant: { status: "ACTIVE" },
    },
    select: {
      merchantId: true,
      plan: true,
    },
  });

  const premiumMerchantIds: string[] = [];
  const featuredMerchantIds: string[] = [];

  for (const subscription of subscriptions) {
    if (subscription.plan === "PREMIUM_BANNER") {
      premiumMerchantIds.push(subscription.merchantId);
    } else if (subscription.plan === "FEATURED") {
      featuredMerchantIds.push(subscription.merchantId);
    }
  }

  return {
    premiumMerchantIds,
    featuredMerchantIds,
    promotedMerchantIds: [...premiumMerchantIds, ...featuredMerchantIds],
  };
}
