Dorokartes Growth / SEO Evidence Dashboard v2

PURPOSE
Adds an admin-only evidence dashboard at /admin/growth.
It uses existing project data and does not label clicks as sales/conversions.

INCLUDED
- active / verified gift cards
- active / indexable merchants
- current sitemap/indexable-page footprint
- explicit distinction between indexable pages and Google-indexed pages
- first-party catalog views: 7 / 30 / 90 days
- outbound merchant clicks: 7 / 30 / 90 days
- internal searches: 7 / 30 / 90 days
- previous-period deltas for 7 / 30 / 90 day event windows
- zero-result search demand
- merchant funnel: leads -> approved -> portal active -> paid merchants
- active subscriptions
- MRR / ARR
- PremiumPlacement lifetime impressions / clicks / CTR
- Google Analytics configuration status
- Search Console adapter contract with Google metrics kept NULL until real API integration exists

IMPORTANT EVIDENCE RULES
- Outbound clicks are not sales.
- Sitemap/indexable page counts are not Google-indexed page counts.
- PremiumPlacement metrics are lifetime counters because the current model stores aggregate counters, not event-level history.
- Search Console clicks/impressions/CTR/position/indexed pages remain blank until a real API integration is connected.
- No fake metrics are generated.

DOES NOT TOUCH
- homepage
- public CSS
- favicon
- merchant portal
- Prisma schema
- database migrations
- existing admin redesign CSS/layout

FILES
- app/admin/growth/page.tsx
- app/admin/growth/growth.module.css
- lib/admin/growth.ts
- lib/admin/search-console.ts
- scripts/install-admin-growth-v2.mjs

INSTALL FROM D:\dorokartes
1. Extract this ZIP directly over D:\dorokartes
2. Run:
   node .\scripts\install-admin-growth-v2.mjs
3. Build:
   npm run build

No npm install is required for this patch.
No Prisma migration is required.
Do not run npm audit fix --force.

EXPECTED INSTALLER OUTPUT
PASS: Growth navigation added.
PASS: Growth page metadata added.
PASS: Admin Growth / SEO Evidence v2 installer completed.

If Growth was already present, the first two lines may say "already present" and still PASS.
