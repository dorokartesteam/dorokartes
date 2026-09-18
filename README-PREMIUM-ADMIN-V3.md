# Dorokartes Premium Admin v3

A production-oriented admin surface for Dorokartes.

## What is included
- Premium dark SaaS shell with sidebar, sticky command bar, responsive layout
- Dashboard with real Prisma counts and catalog-health metrics
- Merchants directory
- Gift Cards inventory + feature/hide actions
- Discovery queue + Accept / Review / Reject
- Verification Center
- Categories + Occasions taxonomy
- Quality Center
- Analytics/Search Insights compatibility layer
- Pipeline/Jobs operational center
- Duplicate Center
- Homepage merchandising manager blueprint
- SEO Center
- Settings/runtime health
- Safe Prisma compatibility helpers: optional models gracefully return empty data instead of crashing
- No new npm UI dependency required

## Install safely

Extract this ZIP in `D:\dorokartes`.

Then:

```powershell
node scripts/install-premium-admin-v3.mjs
npm run build
npm run dev
```

Open:

```text
http://localhost:3000/admin
```

The installer automatically backs up the existing `app/admin` folder before replacing files.

## Architecture
Heavy discovery/pipeline scripts remain offline and are intentionally not spawned inside Vercel request handlers. The web admin is for production state, review and visibility. This prevents Vercel timeouts and accidental server-side command execution.

## Compatibility assumptions
- Existing `lib/prisma.ts` singleton
- Existing Prisma `Merchant`, `GiftCard`, `DiscoveryItem`, `Category`, `Occasion`
- Existing Basic Auth `proxy.ts` protecting `/admin/*` and `/api/admin/*`
- Next.js App Router

Optional models such as analytics/search/review flags are queried through a safe compatibility layer; if absent, those panels show zero/empty instead of breaking the build.
