# Merchant analytics measurement

Implemented locally on 2026-09-15. No schema migration, production deployment or test events written to production.

## Database report

The existing admin Analytics page reads the last 30 days of `OutboundClick.clickedAt` and `SearchEvent.searchedAt`. It shows real totals, recent records, top merchants, top gift cards and top categories. Categories use the card's current primary category, once per click; deleted cards or missing primary categories remain in an explicit unknown bucket. Rankings cover all records in the interval, not only the recent-record list.

These are recorded redirect requests, not unique people. Historical rows may include automated or prefetched requests. No historical rows were rewritten. A failed query displays unavailable, never a fabricated zero.

## Browser measurement

`catalog_view` fires once when a brand or gift-card page becomes visible and the existing GA tag is initialized. Prefetching server content does not fire this event. React StrictMode and repeated visibility changes do not duplicate the view. A new page visit can create a new view.

`catalog_outbound_click` fires on a primary or middle-button activation of a tracked gift-card link. Context-menu actions, blocked analytics and scripts disabled in the browser may not be measured. Redirects still work if GA is unavailable.

Both events use `merchant_id`, optional `gift_card_id`, optional `catalog_category`, `page_type` and the canonical `source_path`. Custom context excludes search queries, email addresses and full referrers. Events use the existing GA initialization and run only on dorokartes.gr / www.dorokartes.gr. Preview and localhost do not send these events.

The database redirect distinguishes `public_brand` from `public_gift_card`. It retains the existing referrer when the browser supplies it. HEAD and recognized prefetch/prerender requests do not create click rows; inactive merchants do not receive tracked redirects.

## Reporting boundary and remaining setup

The database contains no view model. Views and CTR are therefore unavailable in the database report, rather than displayed as zero. The GA events are ready in code; production collection must be verified after deployment.

For GA reporting, register event-scoped dimensions for merchant_id, gift_card_id, catalog_category, page_type and source_path as needed. This follows the [GA event parameter documentation](https://developers.google.com/analytics/devguides/collection/ga4/event-parameters).

Calculate merchant/card click-through using the same GA cohort, period and page type: sessions with a corresponding view and outbound click divided by sessions with that view. Do not divide database redirects by GA views. Raw click-event/view-event ratios measure clicks per view and can exceed 100%; they are not a unique-session CTR.

No GA property reporting connection is available in this workspace. Configuring the property dimensions and importing a consistent GA view/click cohort into admin remain separate work. There is no billing or sponsored-placement implementation in this change.

## Checks

- Scoped TypeScript, ESLint and unit tests for profiles, analytics aggregation/failures, production-host gating and redirect behavior.
- Read-only production database comparison: report totals match direct counts; merchant/card/category totals each reconcile.
- Browser component checks: delayed GA readiness, StrictMode, page changes, localhost exclusion and click events, with all network requests mocked.
- Local mobile/desktop profile and admin render checks; outbound links intercepted, no test database writes.

See `merchant-analytics-data-check.json`, `merchant-profile-browser-check.json` and `catalog-events-browser-check.json` for recorded results.

Repeat the unit checks with `node --import tsx --test tests/public/*.test.ts`. Run `node tests/public/catalog-events.browser.mjs` for isolated browser events. The read-only UI check, `node tests/public/merchant-profile.browser.mjs`, requires the local app on port 3100 with its database connection configured.

## Files changed in this continuation

- `app/brands/[slug]/page.tsx`
- `app/gift-cards/[slug]/page.tsx`
- `app/go/[id]/route.ts`
- `app/admin/analytics/page.tsx`
- `components/analytics/GoogleAnalytics.tsx`
- `components/analytics/CatalogView.tsx`
- `components/analytics/CatalogOutboundLink.tsx`
- `lib/public/merchant-profile.ts`
- `lib/public/catalog-analytics.ts`
- `lib/public/outbound-request.ts`
- `lib/admin/data.ts`
- `lib/admin/analytics.ts`
- `lib/admin/analytics-summary.ts`
- `tests/public/merchant-profile.test.ts`
- `tests/public/catalog-analytics.test.ts`
- `tests/public/outbound-route.test.ts`
- `tests/public/analytics-summary.test.ts`
- `tests/public/analytics-data.test.ts`
- `tests/public/catalog-events.browser.mjs`
- `tests/public/merchant-profile.browser.mjs`
- This measurement note and the three JSON check reports listed above.

## Production release — 2026-09-17

Deployment `dpl_A1wDhN9gtbzYC7FEACzT94pAYFQf` is READY and aliased to https://dorokartes.gr. Vercel build and TypeScript passed. Public search, pagination, merchant profiles, related cards, mobile layout, sampled canonical/indexability, sitemap, robots and the HEAD outbound redirect passed production checks. The HEAD check produced zero click rows.

Configuration blockers confirmed with `vercel env ls production`: only DATABASE_URL is configured. ADMIN_USER and ADMIN_PASSWORD are missing, so admin fails closed with HTTP 503. NEXT_PUBLIC_GA_MEASUREMENT_ID is missing, so the GA tag and custom events are not enabled. No credentials were generated or changed. User input has been requested for these missing settings.

See `production-deployment-2026-09-17.json` and `production-release-check.json`. No application code was changed during deployment; `.vercelignore` was added to exclude local artifacts and use the matching existing npm lockfile.
