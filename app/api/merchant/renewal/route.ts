import { NextResponse } from "next/server";
import { getMerchantMember } from "@/lib/merchant/auth";
import { getStripe } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/merchant/stripe-billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await getMerchantMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const mode = body?.mode;

  if (mode !== "AUTO" && mode !== "MANUAL") {
    return NextResponse.json({ error: "Μη έγκυρος τρόπος ανανέωσης." }, { status: 400 });
  }

  const stripeSubscriptionId = member.merchant.subscription?.stripeSubscriptionId;

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { error: "Δεν υπάρχει ενεργή Stripe συνδρομή για αλλαγή ανανέωσης." },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: mode === "MANUAL",
    });

    await syncStripeSubscription(updated);

    return NextResponse.json({
      ok: true,
      renewalMode: updated.cancel_at_period_end ? "MANUAL" : "AUTO",
    });
  } catch (error) {
    console.error("Merchant renewal update failed", error);
    return NextResponse.json(
      { error: "Το Stripe δεν μπόρεσε να ενημερώσει την ανανέωση της συνδρομής." },
      { status: 500 },
    );
  }
}
