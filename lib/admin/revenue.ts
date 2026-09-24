import { prisma } from "@/lib/prisma";
import { MERCHANT_PLAN_DETAILS } from "@/lib/merchant/plans";

const PLAN_PRICE_CENTS = {
  PARTNER: MERCHANT_PLAN_DETAILS.PARTNER.priceCents,
  FEATURED: MERCHANT_PLAN_DETAILS.FEATURED.priceCents,
  PREMIUM_BANNER: MERCHANT_PLAN_DETAILS.PREMIUM_BANNER.priceCents,
} as const;

type PlanKey = keyof typeof PLAN_PRICE_CENTS;

function priceForPlan(plan: string) {
  return PLAN_PRICE_CENTS[plan as PlanKey] ?? 0;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getRevenueDashboardData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [subscriptions, leads, portalMerchants, premiumSlots, recentLeads] = await Promise.all([
    prisma.merchantSubscription.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        plan: true,
        status: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        merchant: {
          select: {
            id: true,
            name: true,
            slug: true,
            members: {
              take: 1,
              orderBy: { createdAt: "asc" },
              select: { email: true, status: true },
            },
          },
        },
      },
    }),
    prisma.merchantLead.findMany({
      select: {
        id: true,
        status: true,
        requestedPlan: true,
        matchedMerchantId: true,
        createdAt: true,
        reviewedAt: true,
      },
    }),
    prisma.merchant.count({ where: { members: { some: {} } } }),
    prisma.premiumPlacement.count({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    }),
    prisma.merchantLead.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        businessName: true,
        contactName: true,
        email: true,
        status: true,
        requestedPlan: true,
        createdAt: true,
        matchedMerchant: { select: { id: true, name: true } },
      },
    }),
  ]);

  const active = subscriptions.filter((row) => row.status === "ACTIVE");
  const pending = subscriptions.filter((row) => row.status === "PENDING");
  const pastDue = subscriptions.filter((row) => row.status === "PAST_DUE");
  const canceled = subscriptions.filter((row) => row.status === "CANCELED");

  const mrrCents = active.reduce((sum, row) => sum + priceForPlan(row.plan), 0);
  const arrCents = mrrCents * 12;
  const newActiveThisMonth = active.filter((row) => {
    const started = row.startsAt ?? row.createdAt;
    return started >= monthStart;
  }).length;

  const planMix = {
    PARTNER: active.filter((row) => row.plan === "PARTNER").length,
    FEATURED: active.filter((row) => row.plan === "FEATURED").length,
    PREMIUM_BANNER: active.filter((row) => row.plan === "PREMIUM_BANNER").length,
  };

  const leadStats = {
    total: leads.length,
    submitted: leads.filter((row) => row.status === "SUBMITTED").length,
    underReview: leads.filter((row) => row.status === "UNDER_REVIEW").length,
    approved: leads.filter((row) => row.status === "APPROVED").length,
    rejected: leads.filter((row) => row.status === "REJECTED").length,
  };

  const requestedPlans = {
    PARTNER: leads.filter((row) => row.requestedPlan === "PARTNER").length,
    FEATURED: leads.filter((row) => row.requestedPlan === "FEATURED").length,
    PREMIUM_BANNER: leads.filter((row) => row.requestedPlan === "PREMIUM_BANNER").length,
    NONE: leads.filter((row) => !row.requestedPlan).length,
  };

  return {
    now,
    mrrCents,
    arrCents,
    activeSubscriptions: active.length,
    pendingSubscriptions: pending.length,
    pastDueSubscriptions: pastDue.length,
    canceledSubscriptions: canceled.length,
    newActiveThisMonth,
    portalMerchants,
    premiumSlots: Math.min(4, premiumSlots),
    premiumCapacity: 4,
    planMix,
    leadStats,
    requestedPlans,
    funnel: {
      leads: leads.length,
      approved: leadStats.approved,
      portal: portalMerchants,
      paid: active.length,
      leadToApproved: percent(leadStats.approved, leads.length),
      approvedToPaid: percent(active.length, leadStats.approved),
      leadToPaid: percent(active.length, leads.length),
    },
    recentSubscriptions: subscriptions.slice(0, 12),
    recentLeads,
  };
}
