import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();

if (!key) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY. Put your Stripe TEST secret key in .env.local first.",
  );
}

const stripe = new Stripe(key);

const plans = [
  {
    key: "PARTNER",
    name: "Dorokartes Partner",
    amount: 999,
    lookupKey: "dorokartes_partner_monthly",
    env: "STRIPE_PRICE_PARTNER",
  },
  {
    key: "FEATURED",
    name: "Dorokartes Featured",
    amount: 1999,
    lookupKey: "dorokartes_featured_monthly",
    env: "STRIPE_PRICE_FEATURED",
  },
  {
    key: "PREMIUM_BANNER",
    name: "Dorokartes Premium Banner",
    amount: 3999,
    lookupKey: "dorokartes_premium_banner_monthly",
    env: "STRIPE_PRICE_PREMIUM_BANNER",
  },
] as const;

async function ensurePrice(plan: (typeof plans)[number]) {
  const existing = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    active: true,
    limit: 1,
  });

  if (existing.data[0]) {
    return existing.data[0];
  }

  const product = await stripe.products.create({
    name: plan.name,
    metadata: {
      dorokartes_plan: plan.key,
    },
  });

  return stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: plan.amount,
    recurring: {
      interval: "month",
    },
    lookup_key: plan.lookupKey,
    metadata: {
      dorokartes_plan: plan.key,
    },
  });
}

async function main() {
  console.log("Creating/reusing Dorokartes Stripe TEST products and prices...\n");

  for (const plan of plans) {
    const price = await ensurePrice(plan);
    console.log(`${plan.env}=${price.id}`);
  }

  console.log("\nCopy the three lines above into .env.local.");
  console.log(
    "Before LIVE mode, create/use LIVE prices separately and decide VAT/tax treatment.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
