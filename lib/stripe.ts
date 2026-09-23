import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      appInfo: {
        name: "Dorokartes Merchant Billing",
        version: "1.0.0",
      },
    });
  }

  return stripeInstance;
}
