import { NextRequest, NextResponse } from "next/server";
import { getMerchantMember } from "@/lib/merchant/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

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

  const subscription = await prisma.merchantSubscription.findUnique({
    where: { merchantId: member.merchantId },
  });

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Δεν υπάρχει ακόμη Stripe customer για αυτή την επιχείρηση." },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appOrigin(request)}/merchant/billing`,
  });

  return NextResponse.json({
    ok: true,
    url: portal.url,
  });
}
