# Dorokartes Transferability Inventory v1

Generated: 2026-09-22T12:44:29.398Z

## Package
- Name: dorokartes
- Version: 0.1.0
- Package manager: N/A

## Scripts
- `dev`: `next dev`
- `build`: `next build`
- `start`: `next start`
- `lint`: `eslint`
- `db:seed`: `tsx prisma/seed.ts`
- `pipeline:discover`: `tsx scripts/pipeline/commands/discover.ts`
- `pipeline:verify`: `tsx scripts/pipeline/commands/verify.ts`
- `pipeline:rediscover`: `tsx scripts/pipeline/commands/rediscover.ts`
- `pipeline:canonicalize`: `tsx scripts/pipeline/commands/canonicalize.ts`
- `pipeline:promote`: `tsx scripts/pipeline/commands/promote.ts`
- `pipeline:reverify`: `tsx scripts/pipeline/commands/reverify.ts`
- `pipeline:review`: `tsx scripts/pipeline/commands/review.ts`
- `pipeline:validate`: `tsx scripts/pipeline/commands/validate.ts`
- `pipeline:test`: `tsx tests/pipeline/unified-regression.ts`
- `pipeline:governance`: `tsx scripts/pipeline/admin/seed-governance.ts`
- `pipeline:rediscovery-reconcile`: `tsx scripts/pipeline/admin/rediscovery-reconcile.ts`
- `pipeline:verification-overrides`: `tsx scripts/pipeline/admin/seed-verification-overrides.ts`
- `pipeline:diag:llm`: `tsx scripts/pipeline/diagnostics/diagnose-llm.ts`
- `pipeline:diag:content`: `tsx scripts/pipeline/diagnostics/diagnose-content.ts`
- `pipeline:diag:preflight`: `tsx scripts/pipeline/diagnostics/preflight.ts`
- `pipeline:cleanup-stale`: `tsx scripts/pipeline/admin/cleanup-stale-discovery.ts`
- `pipeline:discover-summary`: `tsx scripts/pipeline/admin/discovery-scale-summary.ts`
- `pipeline:queue-reconcile`: `tsx scripts/pipeline/admin/queue-reconcile.ts`
- `pipeline:repair-program-info`: `tsx scripts/pipeline/admin/repair-program-info.ts`
- `pipeline:resolve-universe`: `tsx scripts/pipeline/admin/resolve-universe.ts`
- `pipeline:build-scan-ready`: `tsx scripts/pipeline/admin/build-scan-ready.ts`
- `pipeline:cleanup-universe`: `tsx scripts/pipeline/admin/cleanup-universe.ts`
- `pipeline:harvest-bestprice`: `tsx scripts/pipeline/admin/harvest-bestprice.ts`
- `pipeline:harvest-kouponia365`: `tsx scripts/pipeline/admin/harvest-kouponia365.ts`
- `pipeline:resolve-kouponia365-local`: `tsx scripts/pipeline/admin/resolve-kouponia365-local.ts`
- `pipeline:resolve-kouponia365-curated`: `tsx scripts/pipeline/admin/resolve-kouponia365-curated.ts`
- `pipeline:resolve-kouponia365-curated-v2`: `tsx scripts/pipeline/admin/resolve-kouponia365-curated-v2.ts`
- `pipeline:resolve-kouponia365`: `tsx scripts/pipeline/admin/resolve-kouponia365.ts`
- `pipeline:resolve-kouponia365-curated-v3`: `tsx scripts/pipeline/admin/resolve-kouponia365-curated-v3.ts`
- `pipeline:resolve-kouponia365-fast-v4`: `tsx scripts/pipeline/admin/resolve-kouponia365-fast-v4.ts`
- `pipeline:harvest-search`: `tsx scripts/pipeline/admin/harvest-search.ts`
- `pipeline:harvest-search-v2`: `tsx scripts/pipeline/admin/harvest-search-v2.ts`
- `pipeline:extract-bestprice-issuers`: `tsx scripts/pipeline/admin/extract-bestprice-issuers.ts`
- `pipeline:extract-bestprice-issuers-v4`: `tsx scripts/pipeline/admin/extract-bestprice-issuers-v4.ts`
- `pipeline:dedupe-bestprice-issuers`: `tsx scripts/pipeline/admin/dedupe-bestprice-issuers.ts`
- `pipeline:merge-bestprice-evidence`: `tsx scripts/pipeline/admin/merge-bestprice-evidence.ts`
- `pipeline:harvest-google-serper`: `tsx scripts/pipeline/discovery/harvest-google-serper.ts`
- `pipeline:google-query-lab`: `tsx scripts/pipeline/discovery/google-query-lab-v2.ts`
- `pipeline:harvest-google-focused`: `tsx scripts/pipeline/discovery/harvest-google-focused-v3.ts`
- `pipeline:clean-google-harvest`: `tsx scripts/pipeline/admin/clean-google-harvest.ts`
- `pipeline:quality-google-harvest`: `tsx scripts/pipeline/admin/google-quality-pass-v1.ts`
- `pipeline:quality-google-strict`: `tsx scripts/pipeline/admin/google-quality-strict-v2.ts`
- `pipeline:harvest-google-wave2`: `tsx scripts/pipeline/discovery/harvest-google-wave2-v4.ts`
- `pipeline:clean-google-wave2`: `tsx scripts/pipeline/admin/clean-google-wave2-v1.ts`
- `pipeline:audit-duplicates`: `tsx scripts/pipeline/admin/audit-duplicates-v1.ts`
- `pipeline:audit-duplicate-clusters`: `tsx scripts/pipeline/admin/audit-duplicate-clusters-v2.ts`
- `pipeline:safe-dedupe`: `tsx scripts/pipeline/admin/safe-dedupe-cleanup-v3.1.ts`
- `pipeline:merchant-progress`: `tsx scripts/pipeline/admin/merchant-progress-audit-v1.ts`
- `pipeline:bulk-promote`: `tsx scripts/pipeline/admin/safe-bulk-promotion-v1.ts`
- `pipeline:pending-cleanup`: `tsx scripts/pipeline/admin/pending-cleanup-v1.ts`
- `pipeline:resolve-confirmed-pending`: `tsx scripts/pipeline/admin/resolve-confirmed-pending-v1.ts`
- `pipeline:mass-harvest-v5`: `tsx scripts/pipeline/discovery/mass-harvest-v5.ts`
- `pipeline:clean-harvest-v5`: `tsx scripts/pipeline/discovery/clean-mass-harvest-v5.1.ts`
- `pipeline:clean-harvest-v5.2`: `tsx scripts/pipeline/discovery/clean-mass-harvest-v5.2.ts`
- `pipeline:clean-harvest-v5.3`: `tsx scripts/pipeline/discovery/clean-mass-harvest-v5.3.ts`
- `pipeline:clean-harvest-v5.4`: `tsx scripts/pipeline/discovery/clean-mass-harvest-v5.4.ts`
- `pipeline:clean-harvest-v5.5`: `tsx scripts/pipeline/discovery/clean-mass-harvest-v5.5.ts`
- `pipeline:import-auto-safe-v5.5`: `tsx scripts/pipeline/discovery/import-auto-safe-v5.5.ts`
- `pipeline:mega-harvest-v6`: `tsx scripts/pipeline/discovery/mega-harvest-v6.ts`
- `pipeline:clean-mega-harvest-v6`: `tsx scripts/pipeline/discovery/clean-mega-harvest-v6.ts`
- `pipeline:import-mega-auto-safe-v6`: `tsx scripts/pipeline/discovery/import-mega-auto-safe-v6.ts`
- `pipeline:focused-harvest-v7`: `tsx scripts/pipeline/discovery/focused-harvest-v7.ts`
- `pipeline:clean-focused-harvest-v7`: `tsx scripts/pipeline/discovery/clean-focused-harvest-v7.ts`
- `pipeline:import-focused-auto-safe-v7`: `tsx scripts/pipeline/discovery/import-focused-auto-safe-v7.ts`
- `pipeline:manual-three-pack`: `tsx scripts/pipeline/admin/manual-three-pack-v1.ts`
- `pipeline:mine-review-universe`: `tsx scripts/pipeline/discovery/review-universe-miner-v1.ts`
- `pipeline:mine-review-universe-v2`: `tsx scripts/pipeline/discovery/review-universe-miner-v2.ts`
- `pipeline:mine-review-universe-v3`: `tsx scripts/pipeline/discovery/review-universe-miner-v3.ts`
- `pipeline:import-review-universe-v3`: `tsx scripts/pipeline/import/import-review-universe-v3.ts`
- `pipeline:import-review-universe-v3.1`: `tsx scripts/pipeline/import/import-review-universe-v3-1.ts`
- `pipeline:mine-review-universe-v4`: `tsx scripts/pipeline/discovery/review-universe-miner-v4.ts`
- `pipeline:mine-review-universe-v4.1`: `tsx scripts/pipeline/discovery/review-universe-miner-v4-1.ts`
- `pipeline:import-review-universe-v4.1`: `tsx scripts/pipeline/import/import-review-universe-v4-1.ts`
- `pipeline:mine-review-universe-v5`: `tsx scripts/pipeline/discovery/review-universe-miner-v5.ts`
- `pipeline:mine-review-universe-v5.1`: `tsx scripts/pipeline/discovery/review-universe-miner-v5-1.ts`
- `pipeline:import-review-universe-v5.1`: `tsx scripts/pipeline/import/import-review-universe-v5-1.ts`
- `pipeline:final-manual-universe`: `tsx scripts/pipeline/final/final-manual-universe-v1.ts`
- `pipeline:final-13-import`: `tsx scripts/pipeline/import/final-13-import-v1.ts`
- `audit:catalog`: `tsx scripts/audit/catalog-quality-audit-v10.ts`
- `fix:merchant-identity-1a`: `tsx scripts/cleanup/merchant-identity-fix-1a.ts`

## Config files
- next.config.ts
- tsconfig.json
- tsconfig.build.json
- eslint.config.mjs
- proxy.ts
- prisma/schema.prisma
- pnpm-lock.yaml
- package-lock.json

## Environment variable names
- ADMIN_PASSWORD
- ADMIN_USER
- CATALOG_AUDIT_STALE_DAYS
- DATABASE_URL
- GOOGLE_HARVEST_DAILY_CAP
- GOOGLE_HARVEST_DELAY_MS
- GOOGLE_HARVEST_PAGES_PER_QUERY
- GOOGLE_HARVEST_RESULTS_PER_PAGE
- KOUPONIA365_RESOLUTION_STATE_PATH
- KOUPONIA365_RESOLVER_MODEL
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_GA_MEASUREMENT_ID
- NODE_ENV
- OPENAI_API_KEY
- OPENAI_VERIFICATION_MODEL
- REDISCOVERY_BATCH_SIZE
- REVERIFY_BATCH_SIZE
- REVERIFY_DAYS
- REVERIFY_RETRY_DAYS
- SERPER_API_KEY
- SOURCE_BACKFILL_BATCH_SIZE
- UNIVERSE_MASTER_PATH
- UNIVERSE_RESOLUTION_STATE_PATH
- UNIVERSE_RESOLVED_PATH
- UNIVERSE_RESOLVER_MODEL
- UNIVERSE_SCAN_READY_PATH
- VERCEL_ENV
- VERIFICATION_BATCH_SIZE
- VERIFICATION_USE_LLM
- VERIFICATION_USE_PLAYWRIGHT
- VERIFICATION_V18_BATCH_SIZE
- VERIFICATION_V18_CONCURRENCY
- VERIFICATION_V18_TIMEOUT_MS
- VERIFICATION_V19_BATCH_SIZE
- VERIFICATION_V19_CONCURRENCY
- VERIFICATION_V19_TIMEOUT_MS

## Prisma
- Schema present: true
- Models: Merchant, MerchantLocation, GiftCard, GiftCardLocationCapability, GiftCardVariant, GiftCardValue, GiftCardRedemption, GiftCardDelivery, Category, GiftCardCategory, Occasion, GiftCardOccasion, SourceRecord, DiscoveryItem, ManualCanonicalOverride, ScoringModelVersion, CanonicalizationRun, CanonicalizationDecision, DiscoveryVerificationAttempt, ManualVerificationOverride, DomainRediscoveryTask, VerificationFetchObservation, ProductionReviewFlag, ProductionVerificationSnapshot, VerificationEvent, MediaAsset, OutboundClick, ImportSource, CrawlJob, SearchEvent, MerchantDiscoveryScan
- Enums: MerchantStatus, GiftCardStatus, VerificationStatus, GiftCardVariantType, RedemptionChannel, LocationCapabilityType, DeliveryMethod, SourceType, DiscoveryScanStatus, DiscoveryStatus, VerificationResult, MediaUsageStatus, VerificationMethod, VerificationAttemptResult, VerificationPageRole, ReviewFlagType, ReviewFlagStatus, RediscoveryTaskStatus

## Documentation status
- ✅ README.md
- ❌ HANDOVER.md
- ❌ ARCHITECTURE.md
- ❌ DEPLOYMENT.md
- ❌ OPERATIONS.md
- ❌ SECURITY.md
- ❌ CONTRIBUTING.md
- ❌ .env.example

