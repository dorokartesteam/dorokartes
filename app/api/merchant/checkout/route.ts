import { NextRequest, NextResponse } from "next/server";
import { getMerchantMember } from "@/lib/merchant/auth";
import type { MerchantPlanKey } from "@/lib/merchant/plans";
import {
  premiumSlotsAvailable,
  releaseReservedPremiumSlot,
  reservePremiumSlot,
  stripePriceForPlan,
} from "@/lib/merchant/stripe-billing";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const allowedPlans = new Set<MerchantPlanKey>([
  "PARTNER",
  "FEATURED",
  "PREMIUM_BANNER",
]);

function appOrigin(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return request.nextUrl.origin;
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin
  );
}

export async function POST(request: NextRequest) {
  const member = await getMerchantMember();

  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    plan?: string;
  } | null;

  const plan = String(body?.plan || "") as MerchantPlanKey;

  if (!allowedPlans.has(plan)) {
    return NextResponse.json({ error: "Μη έγκυρο πακέτο." }, { status: 400 });
  }

  const currentSubscription = await prisma.merchantSubscription.findUnique({
    where: { merchantId: member.merchantId },
  });

  if (
    currentSubscription?.stripeSubscriptionId &&
    ["ACTIVE", "PAST_DUE"].includes(currentSubscription.status)
  ) {
    return NextResponse.json(
      {
        error: "Η συνδρομή διαχειρίζεται πλέον από το Stripe.",
        manageSubscription: true,
      },
      { status: 409 },
    );
  }

  if (plan === "PREMIUM_BANNER") {
    const available = await premiumSlotsAvailable(member.merchantId);

    if (available <= 0) {
      return NextResponse.json(
        {
          error:
            "Οι 4 Premium Banner θέσεις είναι αυτή τη στιγμή κατειλημμένες.",
        },
        { status: 409 },
      );
    }
  } else {
    await releaseReservedPremiumSlot(member.merchantId);
  }

  const stripe = getStripe();
  const priceId = stripePriceForPlan(plan);
  const origin = appOrigin(request);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: member.merchantId,
    customer: currentSubscription?.stripeCustomerId || undefined,
    customer_email: currentSubscription?.stripeCustomerId
      ? undefined
      : member.email,
    success_url: `${origin}/merchant/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/merchant/billing?canceled=1`,
    tax_id_collection: {
      enabled: true,
    },
    metadata: {
      merchantId: member.merchantId,
      plan,
      memberId: member.id,
    },
    subscription_data: {
      metadata: {
        merchantId: member.merchantId,
        plan,
      },
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Το Stripe δεν επέστρεψε Checkout URL." },
      { status: 502 },
    );
  }

  await prisma.merchantSubscription.upsert({
    where: { merchantId: member.merchantId },
    create: {
      merchantId: member.merchantId,
      plan,
      status: "PENDING",
      stripePriceId: priceId,
    },
    update: {
      plan,
      status: "PENDING",
      stripePriceId: priceId,
    },
  });

  if (plan === "PREMIUM_BANNER") {
    try {
      await reservePremiumSlot(member.merchantId);
    } catch (error) {
      if (error instanceof Error && error.message === "PREMIUM_SOLD_OUT") {
        await stripe.checkout.sessions.expire(session.id).catch(() => null);

        return NextResponse.json(
          {
            error:
              "Μόλις έκλεισε και η τελευταία Premium Banner θέση. Δοκίμασε ξανά αργότερα.",
          },
          { status: 409 },
        );
      }

      throw error;
    }
  }

  return NextResponse.json({
    ok: true,
    url: session.url,
  });
}
