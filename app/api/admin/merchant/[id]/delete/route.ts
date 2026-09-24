import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type StripeLikeError = {
  code?: string;
  statusCode?: number;
  message?: string;
};

function isMissingStripeObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as StripeLikeError;
  const message = value.message?.toLowerCase() || "";

  return (
    value.code === "resource_missing" ||
    value.statusCode === 404 ||
    message.includes("no such customer") ||
    message.includes("no such subscription")
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { confirmPermanent?: boolean; confirmName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // handled by validation below
  }

  if (body.confirmPermanent !== true) {
    return NextResponse.json({ error: "permanent_confirmation_required" }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      logoUrl: true,
      giftCards: { select: { id: true } },
      subscription: {
        select: {
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      },
    },
  });

  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  if ((body.confirmName || "").trim() !== merchant.name) {
    return NextResponse.json({ error: "merchant_name_confirmation_mismatch" }, { status: 400 });
  }

  const stripeSubscriptionId = merchant.subscription?.stripeSubscriptionId?.trim() || null;
  const stripeCustomerId = merchant.subscription?.stripeCustomerId?.trim() || null;

  // Cancel live billing before deleting the local record. Old sandbox IDs may not
  // exist under the current live key; resource_missing is therefore safe to ignore.
  if (stripeSubscriptionId || stripeCustomerId) {
    const stripe = getStripe();

    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (error) {
        if (!isMissingStripeObject(error)) {
          console.error("Merchant delete: Stripe subscription cancellation failed", error);
          return NextResponse.json(
            { error: "stripe_subscription_cancel_failed" },
            { status: 502 },
          );
        }
      }
    }

    if (stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        if (!isMissingStripeObject(error)) {
          console.error("Merchant delete: Stripe customer deletion failed", error);
          return NextResponse.json(
            { error: "stripe_customer_delete_failed" },
            { status: 502 },
          );
        }
      }
    }
  }

  const giftCardIds = merchant.giftCards.map((card) => card.id);

  try {
    await prisma.$transaction(async (tx) => {
      // These relations use SetNull in the schema. For a true admin purge we remove
      // their rows instead of leaving orphaned merchant/gift-card history behind.
      await tx.sourceRecord.deleteMany({
        where: {
          OR: [
            { merchantId: merchant.id },
            ...(giftCardIds.length ? [{ giftCardId: { in: giftCardIds } }] : []),
          ],
        },
      });

      await tx.outboundClick.deleteMany({
        where: {
          OR: [
            { merchantId: merchant.id },
            ...(giftCardIds.length ? [{ giftCardId: { in: giftCardIds } }] : []),
          ],
        },
      });

      // Remove lead/contact records that were explicitly matched to this merchant.
      await tx.merchantLead.deleteMany({
        where: { matchedMerchantId: merchant.id },
      });

      // Merchant cascades remove gift cards, variants, values, categories/occasion
      // relations, locations, media, portal members/sessions/magic links,
      // subscription, and premium placements.
      await tx.merchant.delete({ where: { id: merchant.id } });
    });
  } catch (error) {
    console.error("Permanent merchant deletion failed", error);
    return NextResponse.json({ error: "merchant_delete_failed" }, { status: 500 });
  }

  revalidatePath("/admin/merchants");
  revalidatePath("/browse");
  revalidatePath(`/brands/${merchant.slug}`);
  revalidatePath("/sitemap.xml");

  return NextResponse.json({
    ok: true,
    deletedMerchantId: merchant.id,
    deletedMerchantName: merchant.name,
    deletedGiftCards: giftCardIds.length,
  });
}
