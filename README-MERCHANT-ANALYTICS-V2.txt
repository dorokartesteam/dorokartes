Dorokartes Merchant Analytics V2
================================

What this adds
- First-party, privacy-light merchant/catalog view tracking.
- 30-minute dedupe per anonymous browser session/page entity.
- Merchant Analytics dashboard with:
  * Views 7/30 days
  * Outbound clicks 7/30 days
  * 30-day vs previous 30-day comparison
  * CTR
  * Anonymous unique sessions
  * Daily 30-day trend
  * Gift-card performance table
  * Click-source breakdown
  * Premium banner impressions/clicks/CTR when available
- Existing GA catalog_view event remains intact.
- Existing outbound-click history remains intact.

Important
- View history begins when Analytics V2 is deployed. It is not backfilled from Google Analytics.
- No public homepage/layout files are modified by this patch.
- This patch DOES require a Prisma migration.

Install from D:\dorokartes
1) Extract ZIP over D:\dorokartes
2) node scripts/install-merchant-analytics-v2.mjs
3) npx prisma migrate deploy
4) npx prisma generate
5) npm run build

Then commit/push only after all steps pass.
