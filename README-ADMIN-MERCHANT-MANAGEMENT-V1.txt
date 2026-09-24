Dorokartes — Admin Merchant Management v1

Adds commercial/portal visibility directly to Admin > Merchants.

Included:
- Portal / plan / subscription columns in merchant directory
- Commercial filters (portal, active/pending/past-due/canceled subscription, no portal)
- Portal merchant / active subscription / pending / premium-slot summary metrics
- Merchant detail commercial account panel
- Portal member status + last activity
- Suspend portal user (immediate session + unused link revocation)
- Reactivate portal user
- Send fresh 15-minute merchant login link from admin
- Stripe IDs and active public entitlements visible in admin
- Premium placement impression/click counters visible when active
- Lightweight lastSeenAt tracking, max one write per 15 minutes

Important:
- Suspend affects portal access only. It does NOT cancel Stripe billing.
- Permanent merchant deletion remains in the existing Danger Zone.
- No Prisma migration is required.

Install over D:\dorokartes, then run npm run build.
