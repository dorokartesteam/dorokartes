# Architecture

## Overview

Dorokartes.gr is a Next.js application backed by PostgreSQL through Prisma. The same repository contains both the public product and a substantial catalog-maintenance toolchain.

The codebase can be understood as five logical layers:

1. public discovery experience
2. admin management interface
3. relational catalog database
4. discovery / verification pipeline
5. audit and remediation tooling

## Application stack

- Next.js 16.3.2
- React 19.2.8
- TypeScript 5
- Prisma 7.9.1
- PostgreSQL
- Tailwind CSS 4
- Node.js >= 20.19.0

Supporting packages include Cheerio, Playwright, OpenAI SDK, `pg`, `tldts`, `zod`, XML/robots parsing, and concurrency utilities.

## Public surface

Important public routes:

- `/browse`
- `/gift-cards/[slug]`
- `/brands/[slug]`
- `/categories`
- `/categories/[slug]`
- `/occasions`
- `/occasions/[slug]`
- `/regions`
- `/register-store`
- `/go/[id]`

`/go/[id]` acts as a controlled outbound route to merchant destinations.

The public catalog is intentionally separated from raw discovery data. Only catalog records that satisfy the application's public visibility rules should be exposed.

## Admin surface

The admin area includes pages for:

- analytics
- brand controls
- bulk tools
- creation workflows
- discovery
- duplicates
- gift cards
- homepage controls
- media
- merchants
- merge workflows
- pipeline
- quality
- readiness
- remediation
- SEO
- settings
- sources
- taxonomy
- verification

Admin mutation routes include:

- `/api/admin/bulk`
- `/api/admin/gift-card`
- `/api/admin/media`
- `/api/admin/merchant`
- `/api/admin/merge`

Admin access currently relies on credentials supplied through `ADMIN_USER` and `ADMIN_PASSWORD` and enforced from `proxy.ts`.

## Data model

The Prisma schema contains 31 models.

### Catalog entities

- `Merchant`
- `MerchantLocation`
- `GiftCard`
- `GiftCardLocationCapability`
- `GiftCardVariant`
- `GiftCardValue`
- `GiftCardRedemption`
- `GiftCardDelivery`
- `Category`
- `GiftCardCategory`
- `Occasion`
- `GiftCardOccasion`

### Provenance and verification

- `SourceRecord`
- `DiscoveryVerificationAttempt`
- `ManualVerificationOverride`
- `VerificationFetchObservation`
- `ProductionReviewFlag`
- `ProductionVerificationSnapshot`
- `VerificationEvent`

These models provide evidence lineage and allow verified catalog data to remain distinguishable from unreviewed discovery output.

### Discovery and canonicalization

- `DiscoveryItem`
- `ManualCanonicalOverride`
- `ScoringModelVersion`
- `CanonicalizationRun`
- `CanonicalizationDecision`
- `DomainRediscoveryTask`
- `MerchantDiscoveryScan`

### Operational / supporting entities

- `MediaAsset`
- `OutboundClick`
- `ImportSource`
- `CrawlJob`
- `SearchEvent`

## Important enums

The schema includes explicit status types for:

- merchant status
- gift-card status
- verification status
- source type
- discovery status
- verification results/methods
- review flags
- rediscovery tasks
- delivery, redemption, and variant types

This status-driven design is important: unresolved or unsafe records should remain in review states rather than being silently promoted.

## Discovery and verification pipeline

The repository includes commands for:

- discovery
- verification
- rediscovery
- canonicalization
- promotion
- re-verification
- review
- validation
- diagnostics
- duplicate auditing
- harvest/import passes
- reconciliation and cleanup

The pipeline has accumulated historical versions of scripts. A buyer does not need to run every historical script. Current operational commands should be documented and older one-off migration scripts should be treated as audit history unless deliberately reactivated.

## Environment boundaries

Runtime web application variables:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `ADMIN_USER`
- `ADMIN_PASSWORD`

Pipeline / maintenance variables include OpenAI, Serper, verification tuning, harvest limits, audit thresholds, and resolver state paths.

See `.env.example`.

## Hosting and external services

The repository contains references to:

- PostgreSQL / Prisma
- Neon
- Vercel
- OpenAI
- Google Analytics
- Serper-based discovery tooling

The source inventory also detected references to NextAuth/Auth.js, Resend, Stripe, Sentry, UploadThing, Upstash, Supabase, and Cloudflare. Those references should be reviewed during handover to determine which are active production integrations, historical experiments, or unused code paths before credentials are transferred.

## Buyer maintenance model

A buyer should be able to operate the asset through three levels:

1. **Content/admin only** — manage catalog through admin UI.
2. **Catalog operations** — run audits, verification, remediation, and review tooling.
3. **Engineering** — change application code, Prisma schema, deployment, or pipeline behavior.

The handover should identify who is expected to own each level.
