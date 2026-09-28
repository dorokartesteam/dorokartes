Dorokartes SEO Opportunity Action Center v1

PURPOSE
Turns existing live Search Console evidence into a manual-review action queue.
No arbitrary SEO score, no traffic prediction and no fake conversion data.

ADDS
/admin/growth/opportunities

USES REAL 30-DAY SEARCH CONSOLE query + landing-page rows.

ACTION CATEGORIES
1. CTR_OPPORTUNITY
   - impressions >= 10
   - average position <= 10
   - CTR < 3%
   Suggested review: title/meta/snippet and query-to-page intent match.

2. POSITION_4_10
   - impressions >= 10
   - average position 4 through 10
   Suggested review: content depth, internal linking and relevance before creating new content.

3. POSITION_11_20
   - impressions >= 10
   - average position above 10 through 20
   Suggested review: whether current landing page adequately serves intent and whether a dedicated landing page is justified.

IMPORTANT
These are prioritization signals, not guaranteed SEO gains.
The patch does not automatically edit any public page.
It does not create content.
It does not change metadata.
It does not alter the database.

FILES
- lib/admin/search-console.ts
- app/admin/growth/page.tsx
- app/admin/growth/opportunities/page.tsx
- app/admin/growth/opportunities/opportunities.module.css
- scripts/test-search-console.ts
- README-SEO-OPPORTUNITY-ACTION-CENTER-V1.txt

NO NEW ENV VARS
NO PRISMA MIGRATION
NO NPM INSTALL
NO PUBLIC CSS/HOMEPAGE/FAVICON CHANGES

TEST
node --env-file=.env.local --import tsx .\scripts\test-search-console.ts

BUILD
npm run build

Do not run npm audit fix --force.
