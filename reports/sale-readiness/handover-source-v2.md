# Dorokartes Handover Source v2

Generated: 2026-09-22T12:46:38.822Z

## package.json

- name: dorokartes
- version: 0.1.0
- packageManager: N/A
- engines: {"node":">=20.19.0"}

### scripts

- dev: next dev
- build: next build
- start: next start
- lint: eslint
- db:seed: tsx prisma/seed.ts
- pipeline:discover: tsx scripts/pipeline/commands/discover.ts
- pipeline:verify: tsx scripts/pipeline/commands/verify.ts
- pipeline:rediscover: tsx scripts/pipeline/commands/rediscover.ts
- pipeline:canonicalize: tsx scripts/pipeline/commands/canonicalize.ts
- pipeline:promote: tsx scripts/pipeline/commands/promote.ts
- pipeline:reverify: tsx scripts/pipeline/commands/reverify.ts
- pipeline:review: tsx scripts/pipeline/commands/review.ts
- pipeline:validate: tsx scripts/pipeline/commands/validate.ts
- pipeline:test: tsx tests/pipeline/unified-regression.ts
- pipeline:governance: tsx scripts/pipeline/admin/seed-governance.ts
- pipeline:rediscovery-reconcile: tsx scripts/pipeline/admin/rediscovery-reconcile.ts
- pipeline:verification-overrides: tsx scripts/pipeline/admin/seed-verification-overrides.ts
- pipeline:diag:llm: tsx scripts/pipeline/diagnostics/diagnose-llm.ts
- pipeline:diag:content: tsx scripts/pipeline/diagnostics/diagnose-content.ts
- pipeline:diag:preflight: tsx scripts/pipeline/diagnostics/preflight.ts
- pipeline:cleanup-stale: tsx scripts/pipeline/admin/cleanup-stale-discovery.ts
- pipeline:discover-summary: tsx scripts/pipeline/admin/discovery-scale-summary.ts
- pipeline:queue-reconcile: tsx scripts/pipeline/admin/queue-reconcile.ts
- pipeline:repair-program-info: tsx scripts/pipeline/admin/repair-program-info.ts
- pipeline:resolve-universe: tsx scripts/pipeline/admin/resolve-universe.ts
- pipeline:build-scan-ready: tsx scripts/pipeline/admin/build-scan-ready.ts
- pipeline:cleanup-universe: tsx scripts/pipeline/admin/cleanup-universe.ts
- pipeline:harvest-bestprice: tsx scripts/pipeline/admin/harvest-bestprice.ts
- pipeline:harvest-kouponia365: tsx scripts/pipeline/admin/harvest-kouponia365.ts
- pipeline:resolve-kouponia365-local: tsx scripts/pipeline/admin/resolve-kouponia365-local.ts
- pipeline:resolve-kouponia365-curated: tsx scripts/pipeline/admin/resolve-kouponia365-curated.ts
- pipeline:resolve-kouponia365-curated-v2: tsx scripts/pipeline/admin/resolve-kouponia365-curated-v2.ts
- pipeline:resolve-kouponia365: tsx scripts/pipeline/admin/resolve-kouponia365.ts
- pipeline:resolve-kouponia365-curated-v3: tsx scripts/pipeline/admin/resolve-kouponia365-curated-v3.ts
- pipeline:resolve-kouponia365-fast-v4: tsx scripts/pipeline/admin/resolve-kouponia365-fast-v4.ts
- pipeline:harvest-search: tsx scripts/pipeline/admin/harvest-search.ts
- pipeline:harvest-search-v2: tsx scripts/pipeline/admin/harvest-search-v2.ts
- pipeline:extract-bestprice-issuers: tsx scripts/pipeline/admin/extract-bestprice-issuers.ts
- pipeline:extract-bestprice-issuers-v4: tsx scripts/pipeline/admin/extract-bestprice-issuers-v4.ts
- pipeline:dedupe-bestprice-issuers: tsx scripts/pipeline/admin/dedupe-bestprice-issuers.ts
- pipeline:merge-bestprice-evidence: tsx scripts/pipeline/admin/merge-bestprice-evidence.ts
- pipeline:harvest-google-serper: tsx scripts/pipeline/discovery/harvest-google-serper.ts
- pipeline:google-query-lab: tsx scripts/pipeline/discovery/google-query-lab-v2.ts
- pipeline:harvest-google-focused: tsx scripts/pipeline/discovery/harvest-google-focused-v3.ts
- pipeline:clean-google-harvest: tsx scripts/pipeline/admin/clean-google-harvest.ts
- pipeline:quality-google-harvest: tsx scripts/pipeline/admin/google-quality-pass-v1.ts
- pipeline:quality-google-strict: tsx scripts/pipeline/admin/google-quality-strict-v2.ts
- pipeline:harvest-google-wave2: tsx scripts/pipeline/discovery/harvest-google-wave2-v4.ts
- pipeline:clean-google-wave2: tsx scripts/pipeline/admin/clean-google-wave2-v1.ts
- pipeline:audit-duplicates: tsx scripts/pipeline/admin/audit-duplicates-v1.ts
- pipeline:audit-duplicate-clusters: tsx scripts/pipeline/admin/audit-duplicate-clusters-v2.ts
- pipeline:safe-dedupe: tsx scripts/pipeline/admin/safe-dedupe-cleanup-v3.1.ts
- pipeline:merchant-progress: tsx scripts/pipeline/admin/merchant-progress-audit-v1.ts
- pipeline:bulk-promote: tsx scripts/pipeline/admin/safe-bulk-promotion-v1.ts
- pipeline:pending-cleanup: tsx scripts/pipeline/admin/pending-cleanup-v1.ts
- pipeline:resolve-confirmed-pending: tsx scripts/pipeline/admin/resolve-confirmed-pending-v1.ts
- pipeline:mass-harvest-v5: tsx scripts/pipeline/discovery/mass-harvest-v5.ts
- pipeline:clean-harvest-v5: tsx scripts/pipeline/discovery/clean-mass-harvest-v5.1.ts
- pipeline:clean-harvest-v5.2: tsx scripts/pipeline/discovery/clean-mass-harvest-v5.2.ts
- pipeline:clean-harvest-v5.3: tsx scripts/pipeline/discovery/clean-mass-harvest-v5.3.ts
- pipeline:clean-harvest-v5.4: tsx scripts/pipeline/discovery/clean-mass-harvest-v5.4.ts
- pipeline:clean-harvest-v5.5: tsx scripts/pipeline/discovery/clean-mass-harvest-v5.5.ts
- pipeline:import-auto-safe-v5.5: tsx scripts/pipeline/discovery/import-auto-safe-v5.5.ts
- pipeline:mega-harvest-v6: tsx scripts/pipeline/discovery/mega-harvest-v6.ts
- pipeline:clean-mega-harvest-v6: tsx scripts/pipeline/discovery/clean-mega-harvest-v6.ts
- pipeline:import-mega-auto-safe-v6: tsx scripts/pipeline/discovery/import-mega-auto-safe-v6.ts
- pipeline:focused-harvest-v7: tsx scripts/pipeline/discovery/focused-harvest-v7.ts
- pipeline:clean-focused-harvest-v7: tsx scripts/pipeline/discovery/clean-focused-harvest-v7.ts
- pipeline:import-focused-auto-safe-v7: tsx scripts/pipeline/discovery/import-focused-auto-safe-v7.ts
- pipeline:manual-three-pack: tsx scripts/pipeline/admin/manual-three-pack-v1.ts
- pipeline:mine-review-universe: tsx scripts/pipeline/discovery/review-universe-miner-v1.ts
- pipeline:mine-review-universe-v2: tsx scripts/pipeline/discovery/review-universe-miner-v2.ts
- pipeline:mine-review-universe-v3: tsx scripts/pipeline/discovery/review-universe-miner-v3.ts
- pipeline:import-review-universe-v3: tsx scripts/pipeline/import/import-review-universe-v3.ts
- pipeline:import-review-universe-v3.1: tsx scripts/pipeline/import/import-review-universe-v3-1.ts
- pipeline:mine-review-universe-v4: tsx scripts/pipeline/discovery/review-universe-miner-v4.ts
- pipeline:mine-review-universe-v4.1: tsx scripts/pipeline/discovery/review-universe-miner-v4-1.ts
- pipeline:import-review-universe-v4.1: tsx scripts/pipeline/import/import-review-universe-v4-1.ts
- pipeline:mine-review-universe-v5: tsx scripts/pipeline/discovery/review-universe-miner-v5.ts
- pipeline:mine-review-universe-v5.1: tsx scripts/pipeline/discovery/review-universe-miner-v5-1.ts
- pipeline:import-review-universe-v5.1: tsx scripts/pipeline/import/import-review-universe-v5-1.ts
- pipeline:final-manual-universe: tsx scripts/pipeline/final/final-manual-universe-v1.ts
- pipeline:final-13-import: tsx scripts/pipeline/import/final-13-import-v1.ts
- audit:catalog: tsx scripts/audit/catalog-quality-audit-v10.ts
- fix:merchant-identity-1a: tsx scripts/cleanup/merchant-identity-fix-1a.ts

### dependencies

- @prisma/adapter-pg: ^7.9.1
- @prisma/client: ^7.9.1
- cheerio: ^1.1.2
- fast-xml-parser: ^5.2.5
- next: 16.3.2
- openai: ^7.5.0
- p-limit: ^7.1.1
- pg: ^8.16.3
- playwright: ^1.62.1
- prisma: ^7.9.1
- react: 19.2.8
- react-dom: 19.2.8
- robots-parser: ^3.0.1
- tldts: ^7.0.14
- zod: ^4.4.3

### devDependencies

- @tailwindcss/postcss: ^4
- @types/node: ^20
- @types/react: ^19
- @types/react-dom: ^19
- eslint: ^9
- eslint-config-next: 16.3.2
- tailwindcss: ^4
- tsx: ^4.20.6
- typescript: ^5

## Config files

- next.config.ts
- tsconfig.json
- tsconfig.build.json
- eslint.config.mjs
- proxy.ts
- prisma/schema.prisma
- pnpm-lock.yaml
- package-lock.json

## Environment variables (names only)

- ADMIN_PASSWORD
  - used in: proxy.ts
  - used in: scripts/install-admin-security-v1/proxy.template.ts
- ADMIN_USER
  - used in: proxy.ts
  - used in: scripts/install-admin-security-v1/proxy.template.ts
- CATALOG_AUDIT_STALE_DAYS
  - used in: scripts/audit/catalog-quality-audit-v10.ts
- DATABASE_URL
  - used in: lib/prisma.ts
  - used in: prisma.config.ts
  - used in: prisma/seed.ts
  - used in: scripts/audit/master-catalog-reconciliation-v17.ts
  - used in: scripts/cleanup/merchant-identity-fix-1a.ts
  - used in: scripts/cleanup/merchant-identity-fix-1b.ts
  - used in: scripts/discovery/canonical-summary-v2.ts
  - used in: scripts/discovery/canonical-summary.ts
- GOOGLE_HARVEST_DAILY_CAP
  - used in: scripts/pipeline/discovery/harvest-google-serper.ts
- GOOGLE_HARVEST_DELAY_MS
  - used in: scripts/pipeline/discovery/harvest-google-focused-v3.ts
  - used in: scripts/pipeline/discovery/harvest-google-serper.ts
  - used in: scripts/pipeline/discovery/harvest-google-wave2-v4.ts
- GOOGLE_HARVEST_PAGES_PER_QUERY
  - used in: scripts/pipeline/discovery/harvest-google-serper.ts
- GOOGLE_HARVEST_RESULTS_PER_PAGE
  - used in: scripts/pipeline/discovery/harvest-google-serper.ts
- KOUPONIA365_RESOLUTION_STATE_PATH
  - used in: scripts/pipeline/admin/resolve-kouponia365.ts
- KOUPONIA365_RESOLVER_MODEL
  - used in: scripts/pipeline/admin/resolve-kouponia365.ts
- NEXT_PUBLIC_APP_URL
  - used in: app/gift-cards/[slug]/page.tsx
  - used in: app/layout.tsx
  - used in: app/robots.ts
  - used in: app/sitemap.ts
- NEXT_PUBLIC_GA_MEASUREMENT_ID
  - used in: app/layout.tsx
- NODE_ENV
  - used in: lib/prisma.ts
  - used in: proxy.ts
  - used in: scripts/install-admin-security-v1/proxy.template.ts
  - used in: tests/public/catalog-events.browser.mjs
  - used in: tests/public/google-analytics.browser.mjs
- OPENAI_API_KEY
  - used in: scripts/pipeline/admin/resolve-kouponia365.ts
  - used in: scripts/pipeline/admin/resolve-universe.ts
- OPENAI_VERIFICATION_MODEL
  - used in: scripts/pipeline/config.ts
  - used in: scripts/pipeline/core/config.ts
- REDISCOVERY_BATCH_SIZE
  - used in: scripts/pipeline/commands/rediscover.ts
  - used in: scripts/pipeline/rediscover.ts
- REVERIFY_BATCH_SIZE
  - used in: scripts/pipeline/commands/reverify.ts
- REVERIFY_DAYS
  - used in: scripts/audit/verification-enrichment-v18.ts
  - used in: scripts/audit/verification-enrichment-v19b.ts
  - used in: scripts/pipeline/commands/promote.ts
  - used in: scripts/pipeline/commands/reverify.ts
- REVERIFY_RETRY_DAYS
  - used in: scripts/pipeline/commands/reverify.ts
- SERPER_API_KEY
  - used in: scripts/pipeline/discovery/focused-harvest-v7.ts
  - used in: scripts/pipeline/discovery/google-query-lab-v2.ts
  - used in: scripts/pipeline/discovery/harvest-google-focused-v3.ts
  - used in: scripts/pipeline/discovery/harvest-google-serper.ts
  - used in: scripts/pipeline/discovery/harvest-google-wave2-v4.ts
  - used in: scripts/pipeline/discovery/mass-harvest-v5.ts
  - used in: scripts/pipeline/discovery/mega-harvest-v6.ts
- SOURCE_BACKFILL_BATCH_SIZE
  - used in: scripts/audit/source-lineage-backfill-v17-1-1.ts
- UNIVERSE_MASTER_PATH
  - used in: scripts/pipeline/admin/build-scan-ready.ts
  - used in: scripts/pipeline/admin/resolve-universe.ts
- UNIVERSE_RESOLUTION_STATE_PATH
  - used in: scripts/pipeline/admin/resolve-universe.ts
- UNIVERSE_RESOLVED_PATH
  - used in: scripts/pipeline/admin/build-scan-ready.ts
  - used in: scripts/pipeline/admin/resolve-universe.ts
- UNIVERSE_RESOLVER_MODEL
  - used in: scripts/pipeline/admin/resolve-universe.ts
- UNIVERSE_SCAN_READY_PATH
  - used in: scripts/pipeline/admin/build-scan-ready.ts
- VERCEL_ENV
  - used in: app/layout.tsx
- VERIFICATION_BATCH_SIZE
  - used in: scripts/pipeline/commands/verify.ts
  - used in: scripts/pipeline/verify.ts
- VERIFICATION_USE_LLM
  - used in: scripts/pipeline/commands/verify.ts
  - used in: scripts/pipeline/patch-open-rediscovery-skip.mjs
  - used in: scripts/pipeline/verify.ts
- VERIFICATION_USE_PLAYWRIGHT
  - used in: scripts/pipeline/commands/rediscover.ts
  - used in: scripts/pipeline/commands/verify.ts
  - used in: scripts/pipeline/rediscover.ts
  - used in: scripts/pipeline/verify.ts
- VERIFICATION_V18_BATCH_SIZE
  - used in: scripts/audit/verification-enrichment-v18.ts
- VERIFICATION_V18_CONCURRENCY
  - used in: scripts/audit/verification-enrichment-v18.ts
- VERIFICATION_V18_TIMEOUT_MS
  - used in: scripts/audit/verification-enrichment-v18.ts
- VERIFICATION_V19_BATCH_SIZE
  - used in: scripts/audit/verification-enrichment-v19b.ts
- VERIFICATION_V19_CONCURRENCY
  - used in: scripts/audit/verification-enrichment-v19b.ts
- VERIFICATION_V19_TIMEOUT_MS
  - used in: scripts/audit/verification-enrichment-v19b.ts

## Prisma models

- Merchant
- MerchantLocation
- GiftCard
- GiftCardLocationCapability
- GiftCardVariant
- GiftCardValue
- GiftCardRedemption
- GiftCardDelivery
- Category
- GiftCardCategory
- Occasion
- GiftCardOccasion
- SourceRecord
- DiscoveryItem
- ManualCanonicalOverride
- ScoringModelVersion
- CanonicalizationRun
- CanonicalizationDecision
- DiscoveryVerificationAttempt
- ManualVerificationOverride
- DomainRediscoveryTask
- VerificationFetchObservation
- ProductionReviewFlag
- ProductionVerificationSnapshot
- VerificationEvent
- MediaAsset
- OutboundClick
- ImportSource
- CrawlJob
- SearchEvent
- MerchantDiscoveryScan

## Prisma enums

- MerchantStatus
- GiftCardStatus
- VerificationStatus
- GiftCardVariantType
- RedemptionChannel
- LocationCapabilityType
- DeliveryMethod
- SourceType
- DiscoveryScanStatus
- DiscoveryStatus
- VerificationResult
- MediaUsageStatus
- VerificationMethod
- VerificationAttemptResult
- VerificationPageRole
- ReviewFlagType
- ReviewFlagStatus
- RediscoveryTaskStatus

## Detected integrations

- Prisma
- PostgreSQL
- Neon
- Vercel
- NextAuth/Auth.js
- Resend
- Stripe
- Sentry
- UploadThing
- Upstash
- Supabase
- Cloudflare

## Routes

- app/admin/analytics/page.tsx
- app/admin/brand/page.tsx
- app/admin/bulk/page.tsx
- app/admin/create/page.tsx
- app/admin/discovery/page.tsx
- app/admin/duplicates/page.tsx
- app/admin/gift-cards/[id]/page.tsx
- app/admin/gift-cards/page.tsx
- app/admin/homepage/page.tsx
- app/admin/launch/page.tsx
- app/admin/media/page.tsx
- app/admin/merchants/[id]/page.tsx
- app/admin/merchants/page.tsx
- app/admin/merge/page.tsx
- app/admin/page.tsx
- app/admin/pipeline/page.tsx
- app/admin/quality/page.tsx
- app/admin/readiness/page.tsx
- app/admin/remediation/page.tsx
- app/admin/seo/page.tsx
- app/admin/settings/page.tsx
- app/admin/sources/page.tsx
- app/admin/taxonomy/page.tsx
- app/admin/verification/page.tsx
- app/api/admin/bulk/route.ts
- app/api/admin/gift-card/route.ts
- app/api/admin/media/route.ts
- app/api/admin/merchant/route.ts
- app/api/admin/merge/route.ts
- app/brands/[slug]/page.tsx
- app/browse/page.tsx
- app/categories/[slug]/page.tsx
- app/categories/page.tsx
- app/gift-cards/[slug]/page.tsx
- app/go/[id]/route.ts
- app/occasions/[slug]/page.tsx
- app/occasions/page.tsx
- app/regions/page.tsx
- app/register-store/page.tsx

## README preview

```md
# Dorokartes Merchant Cleanup Batch 1

Dry-run:

```powershell
npx tsx scripts/cleanup/merchant-cleanup-batch-1.ts
```

Apply only after review:

```powershell
npx tsx scripts/cleanup/merchant-cleanup-batch-1.ts --apply
```

Scope: 8 verified merchant display-name cleanups and matching card-title cleanups.
No slug/URL/logo/SEO/verification/status/relation changes.

```
