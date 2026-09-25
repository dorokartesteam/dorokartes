Dorokartes Search Console real integration v1

WHAT IT DOES
- Connects the existing Growth / SEO Evidence Dashboard to Google Search Console Search Analytics API.
- Uses a Google service account.
- Uses only built-in Node.js crypto + fetch. No new npm package is required.
- Reads real organic clicks, impressions, CTR and average position.
- Shows 7 / 30 / 90 day periods.
- Calculates previous-period deltas for clicks/impressions.
- Keeps site-wide Google indexed pages as N/A because Search Analytics does not expose a trustworthy site-wide indexed-page total.

FILES
- lib/admin/search-console.ts
- app/admin/growth/page.tsx
- app/admin/growth/growth.module.css
- scripts/test-search-console.ts

ENVIRONMENT
Add these values to .env.local locally and to Vercel Production environment variables:

GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:dorokartes.gr
GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL=<service-account-email>
GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY="<private-key>"
GOOGLE_SEARCH_CONSOLE_DATA_LAG_DAYS=3

The private key may contain literal \n characters:
GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

SEARCH CONSOLE PERMISSION
The service-account email must have access to the exact Search Console property in GOOGLE_SEARCH_CONSOLE_SITE_URL.
For the domain property use exactly:
sc-domain:dorokartes.gr

GOOGLE CLOUD
Enable the Search Console API in the Google Cloud project that owns the service account.

LOCAL TEST
npx tsx .\scripts\test-search-console.ts

BUILD
npm run build

NO DATABASE CHANGES
No Prisma migration.
No schema changes.
No public homepage/CSS/favicon changes.
Do not run npm audit fix --force.

SECURITY
Never commit .env.local, the service-account private key, or the service-account JSON key file to Git.
