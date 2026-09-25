Dorokartes Search Console Intelligence v2

EXTENDS THE LIVE V1 INTEGRATION
No new Google Cloud credentials or permissions are required.

ADDS TO /admin/growth
- Top organic queries (30d)
- Top organic landing pages (30d)
- High-impression / low-CTR query opportunities
- Branded vs non-branded click/impression split
- Existing 7 / 30 / 90 day Search Console metrics remain intact

EVIDENCE RULES
- Search Console data is real Google Search Analytics data.
- Opportunity rows are prioritization signals, not guaranteed SEO gains.
- Current opportunity threshold:
  impressions >= 10
  CTR < 3%
  average position <= 20
- Branded detection only matches Dorokartes / δωροκάρτες variants.
- Google indexed-page totals remain N/A.
- No clicks are labelled as sales/conversions.

FILES REPLACED
- lib/admin/search-console.ts
- app/admin/growth/page.tsx
- app/admin/growth/growth.module.css
- scripts/test-search-console.ts

NO CHANGES
- No Prisma schema
- No migration
- No public homepage
- No public CSS
- No favicon
- No new npm dependencies
- No environment variable changes

TEST
node --env-file=.env.local --import tsx .\scripts\test-search-console.ts

BUILD
npm run build

Do not run npm audit fix --force.
