import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { MerchantPlanKey } from "@/lib/merchant/plans";

export const STRIPE_PRICE_ENV: Record<MerchantPlanKey, string> = {
  PARTNER: "STRIPE_PRICE_PARTNER",
  FEATURED: "STRIPE_PRICE_FEATURED",
  PREMIUM_BANNER: "STRIPE_PRICE_PREMIUM_BANNER",
};

export function stripePriceForPlan(plan: MerchantPlanKey) {
  const envName = STRIPE_PRICE_ENV[plan];
  const priceId = process.env[envName]?.trim();

  if (!priceId) {
    throw new Error(`${envName} is not configured.`);
  }

  return priceId;
}

export function planFromStripePrice(priceId: string | null | undefined): MerchantPlanKey | null {
  if (!priceId) return null;

  if (priceId === process.env.STRIPE_PRICE_PARTNER?.trim()) return "PARTNER";
  if (priceId === process.env.STRIPE_PRICE_FEATURED?.trim()) return "FEATURED";
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_BANNER?.trim()) return "PREMIUM_BANNER";

  return null;
}

function toDate(seconds: number | null | undefined) {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const raw = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    startsAt: toDate(raw.current_period_start) ?? new Date(),
    endsAt:
      toDate(raw.current_period_end) ??
      new Date(Date.now() + 31 * 86_400_000),
  };
}

export function internalSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
) {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "ACTIVE" as const;

  if (
    stripeStatus === "past_due" ||
    stripeStatus === "unpaid" ||
    stripeStatus === "paused"
  ) {
    return "PAST_DUE" as const;
  }

  if (
    stripeStatus === "canceled" ||
    stripeStatus === "incomplete_expired"
  ) {
    return "CANCELED" as const;
  }

  return "PENDING" as const;
}

export async function premiumSlotsAvailable(excludeMerchantId?: string) {
  const now = new Date();
  const horizon = new Date(Date.now() + 31 * 86_400_000);

  const used = await prisma.premiumPlacement.count({
    where: {
      ...(excludeMerchantId
        ? { merchantId: { not: excludeMerchantId } }
        : {}),
      status: { in: ["RESERVED", "ACTIVE"] },
      startsAt: { lt: horizon },
      endsAt: { gt: now },
    },
  });

  return Math.max(0, 4 - used);
}

export async function reservePremiumSlot(merchantId: string) {
  const available = await premiumSlotsAvailable(merchantId);

  if (available <= 0) {
    throw new Error("PREMIUM_SOLD_OUT");
  }

  const now = new Date();
  const endsAt = new Date(Date.now() + 31 * 86_400_000);

  await prisma.$transaction([
    prisma.premiumPlacement.updateMany({
      where: {
        merchantId,
        status: "RESERVED",
      },
      data: { status: "CANCELED" },
    }),
    prisma.premiumPlacement.create({
      data: {
        merchantId,
        status: "RESERVED",
        startsAt: now,
        endsAt,
      },
    }),
  ]);
}

export async function releaseReservedPremiumSlot(merchantId: string) {
  await prisma.premiumPlacement.updateMany({
    where: {
      merchantId,
      status: "RESERVED",
    },
    data: {
      status: "CANCELED",
    },
  });
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
) {
  const merchantId = subscription.metadata?.merchantId?.trim();

  if (!merchantId) {
    console.warn(
      "Stripe subscription has no merchantId metadata:",
      subscription.id,
    );
    return null;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan =
    planFromStripePrice(priceId) ||
    ((subscription.metadata?.plan || "") as MerchantPlanKey);

  if (!["PARTNER", "FEATURED", "PREMIUM_BANNER"].includes(plan)) {
    console.warn(
      "Stripe subscription has unknown Dorokartes plan:",
      subscription.id,
      priceId,
      subscription.metadata?.plan,
    );
    return null;
  }

  const status = internalSubscriptionStatus(subscription.status);
  const { startsAt, endsAt } = subscriptionPeriod(subscription);

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  await prisma.merchantSubscription.upsert({
    where: { merchantId },
    create: {
      merchantId,
      plan,
      status,
      startsAt,
      endsAt,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
    },
    update: {
      plan,
      status,
      startsAt,
      endsAt,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
    },
  });

  if (plan === "PREMIUM_BANNER" && status === "ACTIVE") {
    const currentPlacement = await prisma.premiumPlacement.findFirst({
      where: {
        merchantId,
        status: { in: ["RESERVED", "ACTIVE"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (currentPlacement) {
      await prisma.$transaction([
        prisma.premiumPlacement.updateMany({
          where: {
            merchantId,
            id: { not: currentPlacement.id },
            status: { in: ["RESERVED", "ACTIVE"] },
          },
          data: { status: "CANCELED" },
        }),
        prisma.premiumPlacement.update({
          where: { id: currentPlacement.id },
          data: {
            status: "ACTIVE",
            startsAt,
            endsAt,
          },
        }),
      ]);
    } else {
      await prisma.premiumPlacement.create({
        data: {
          merchantId,
          status: "ACTIVE",
          startsAt,
          endsAt,
        },
      });
    }
  } else if (plan !== "PREMIUM_BANNER" || status !== "ACTIVE") {
    await prisma.premiumPlacement.updateMany({
      where: {
        merchantId,
        status: { in: ["RESERVED", "ACTIVE"] },
      },
      data: { status: "CANCELED" },
    });
  }

  return {
    merchantId,
    plan,
    status,
  };
}
