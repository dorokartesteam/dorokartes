import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  releaseReservedPremiumSlot,
  syncStripeSubscription,
} from "@/lib/merchant/stripe-billing";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function merchantIdFromSession(session: Stripe.Checkout.Session) {
  return (
    session.metadata?.merchantId?.trim() ||
    session.client_reference_id?.trim() ||
    null
  );
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error("Stripe webhook signature failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription" || !session.subscription) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        await syncStripeSubscription(subscription);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const merchantId = merchantIdFromSession(session);

        if (merchantId) {
          await releaseReservedPremiumSlot(merchantId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const merchantId = subscription.metadata?.merchantId?.trim();

        if (merchantId) {
          await prisma.merchantSubscription.updateMany({
            where: { merchantId },
            data: {
              status: "CANCELED",
              endsAt: new Date(),
            },
          });

          await prisma.premiumPlacement.updateMany({
            where: {
              merchantId,
              status: { in: ["RESERVED", "ACTIVE"] },
            },
            data: { status: "CANCELED" },
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook processing failed:", event.type, error);

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
