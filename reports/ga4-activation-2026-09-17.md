# GA4 activation — 2026-09-17

GA already existed in the root layout, but the production Measurement ID was absent and script loading was not restricted to public routes.

Set NEXT_PUBLIC_GA_MEASUREMENT_ID=G-NHQ886KR9Q in Vercel Production. Deployment dpl_9vQKbc1i4XHUVnZtN9irPoaCQRQP is READY at https://dorokartes.gr. The ID remains environment-driven in application code.

## Changed application/test files

- components/analytics/GoogleAnalytics.tsx
- lib/public/google-analytics.ts
- tests/public/google-analytics.test.ts
- tests/public/google-analytics.browser.mjs

The existing Next.js Script component loads one Google tag on production public routes. Initialization runs once per document. A route guard disables collection before history transitions to admin or non-public routes, including popstate. Normal page views use GA's existing automatic initial and Enhanced Measurement history events; no additional manual page_view events were introduced.

## Verification

- Scoped TypeScript and ESLint passed.
- Four scoped unit tests passed, including existing catalog-event regression coverage.
- Browser fixture with the real Google tag: five public page views, one script/config initialization, no admin or localhost script loads, no duplicate views.
- Deployed Next.js site: six page views across public client navigations, query/filter/pagination changes and back navigation; one script load for that document. A fresh brand-page document sent one additional page view and queued one catalog_view, with the correct Measurement ID.
- Collection requests were intercepted, so verification did not submit test events to GA. This checks browser event generation and destination; GA reporting ingestion was not independently inspected.
- Vercel's deployment build and TypeScript passed. No separate local full build was run for this change.

See ga4-scoped-browser-check.json and ga4-production-check.json.

There is no remaining GA deployment blocker. The separate existing admin credential blocker remains: /admin/analytics returns 503 because ADMIN_USER and ADMIN_PASSWORD are not configured. No admin credentials or unrelated application code were changed.

Google reference for automatic page views and Enhanced Measurement: https://developers.google.com/analytics/devguides/collection/ga4/views
