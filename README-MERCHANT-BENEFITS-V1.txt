Dorokartes Merchant Benefits v1
===============================

Milestone: connect paid merchant plans to real public-site benefits.

Included:
- Active Partner/Featured/Premium merchants get a public Dorokartes partner badge.
- Featured merchants get priority in browse/category/occasion results.
- Premium merchants inherit Featured priority.
- Search adds a controlled promotion boost only after relevance is established.
- Regions prioritize Featured/Premium when the visitor is NOT sorting by live distance.
- Near-me results remain distance-first.
- Premium Banner gets a large homepage rotation, max 4 active placements.
- Premium banner impressions/clicks increment PremiumPlacement counters.
- Stripe subscription sync now preserves the same PremiumPlacement record/counters instead of recreating it on every update webhook.

No Prisma migration required.
No new environment variable required.

Important:
Benefits are intentionally shown only for ACTIVE, non-expired merchant subscriptions.
Premium homepage banners also require an ACTIVE PremiumPlacement within its date window.
