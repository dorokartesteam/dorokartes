Dorokartes Merchant Portal V4.1

Adds:
- Fixed pricing-card feature graphics/text sizing. This explicitly overrides old V2/V3 `li > span` rules that were shrinking feature text to icon width.
- New left navigation tab: Παραγγελίες.
- Stripe invoice/payment history from the merchant's real Stripe customer.
- Hosted invoice / PDF links when Stripe provides them.
- Automatic vs manual renewal control.
  AUTO = normal Stripe automatic renewal.
  MANUAL = Stripe `cancel_at_period_end=true`; the current paid period remains active, then no automatic charge is made.
- No Prisma migration required.

After extracting:
1. npm run build
2. git add -A
3. git commit -m "Add merchant orders history and renewal controls"
4. git push

The Vercel production environment must already contain the live STRIPE_SECRET_KEY.
