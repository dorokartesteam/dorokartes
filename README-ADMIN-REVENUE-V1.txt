Dorokartes Admin Revenue Dashboard v1

Adds:
- /admin/revenue
- Active-plan MRR + annual run rate
- Active/pending/past-due/canceled subscription visibility
- Partner / Featured / Premium plan mix
- Premium slot utilization
- Merchant lead funnel: leads -> approved -> portal -> active subscription
- Lead status and requested-plan breakdown
- Recent leads and subscriptions
- Revenue link in Admin sidebar

Important:
MRR is calculated from ACTIVE Dorokartes MerchantSubscription records and plan prices.
Stripe remains the source of truth for successfully collected cash, refunds and payouts.

No Prisma migration required.
