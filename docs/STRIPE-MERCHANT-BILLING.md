# Dorokartes Merchant Billing — Stripe V1

## What this implements

- Partner: 9.99 EUR / month
- Featured: 19.99 EUR / month
- Premium Banner: 39.99 EUR / month
- Stripe hosted Checkout for initial subscription activation
- Stripe Customer Portal for active subscriptions
- Stripe webhook synchronization
- PENDING -> ACTIVE after successful subscription
- canceled subscriptions -> CANCELED
- Premium Banner inventory capped at 4 active/reserved merchants
- Premium slot reservation during Checkout
- abandoned/expired Premium Checkout releases the reserved slot
- merchant card details never touch Dorokartes servers
- real Dorokartes mark in the upper-left merchant portal brand

## Environment variables

Required:

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PARTNER=price_...
STRIPE_PRICE_FEATURED=price_...
STRIPE_PRICE_PREMIUM_BANNER=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

Existing:

NEXT_PUBLIC_APP_URL=https://dorokartes.gr

## Local webhook

Use the Stripe CLI:

stripe login

stripe listen --forward-to localhost:3000/api/stripe/webhook

Copy the whsec_... value printed by Stripe CLI into:

STRIPE_WEBHOOK_SECRET=whsec_...

Then restart npm run dev.

## Stripe Customer Portal

In Stripe Dashboard enable the Customer Portal.

For package switching through Stripe Portal, allow customers to update subscriptions
and enable the Dorokartes subscription products/prices.

## VAT / tax

The V1 test prices are exact monthly amounts of 9.99 / 19.99 / 39.99 EUR.

Before enabling LIVE payments, decide whether these public prices are VAT-inclusive
or VAT-exclusive and configure Stripe Tax / tax behavior accordingly.
Do not go live before that decision is explicit.
