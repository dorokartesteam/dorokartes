Dorokartes Verification Enrichment v18

Purpose
-------
Evaluate ACTIVE + NEEDS_REVIEW cards with an existing officialUrl.

AUTO_SAFE requires ALL:
- HTTP 2xx
- officialUrl registrable domain == merchant website domain
- final redirect domain == merchant domain
- gift-card semantic evidence in title/H1/URL/body
- purchase/value signal (€/$/£, amount/value, cart/checkout/buy etc.)
- not an obvious terms/privacy/support/gift-set style page

Preview performs live network checks and writes NO database changes.

Install
-------
Copy:
scripts\audit\verification-enrichment-v18.ts
to:
D:\dorokartes\scripts\audit\verification-enrichment-v18.ts

Run
---
1) PREVIEW:
npx tsx scripts/audit/verification-enrichment-v18.ts

Optional small pilot:
npx tsx scripts/audit/verification-enrichment-v18.ts --limit=50

2) APPLY only after reviewing counts/CSV:
npx tsx scripts/audit/verification-enrichment-v18.ts --apply --plan-id=<PLAN_ID>

Apply re-validates every AUTO_SAFE URL before DB writes.

3) POST-AUDIT:
npx tsx scripts/audit/verification-enrichment-v18.ts --post-audit

Then:
npx tsx scripts/audit/master-catalog-reconciliation-v17.ts

Deployment checkpoint after v18:
npm run build
# fix build errors if any
# then deploy through the project's normal Vercel/Git workflow

v18 does NOT change:
- slug
- title
- officialUrl
- merchant identity
- variants
- occasions
- logos
- SEO

It updates only AUTO_SAFE cards:
- verificationStatus -> VERIFIED
- lastVerifiedAt / nextReviewAt
- OFFICIAL SourceRecord if missing
- PASSED VerificationEvent if missing
