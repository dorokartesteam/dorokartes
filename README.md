# Dorokartes.gr

Dorokartes.gr is a Greek gift-card discovery platform and catalog. It helps users discover gift cards by merchant, category, occasion, and brand, then directs them to the merchant's official purchase page.

> Dorokartes.gr is a discovery platform, not the seller of the listed gift cards.

## Current catalog baseline

At the latest catalog audit:

- 1,129 active gift cards
- 1,077 verified active gift cards
- 1,130 active merchants
- 1,107 local canonical merchant logos
- 0 blocker-level catalog issues
- 0 verified cards missing an active OFFICIAL source

Verification and provenance are intentionally conservative. Cards that cannot be verified safely remain in `NEEDS_REVIEW` or `PENDING` rather than being promoted automatically.

## Technology

Core application stack:

- Next.js 16.3.2
- React 19.2.8
- TypeScript 5
- Prisma 7.9.1
- PostgreSQL
- Tailwind CSS 4
- Node.js >= 20.19.0

The repository also contains discovery, verification, reconciliation, catalog-audit, and data-cleanup tooling.

## Public product

Main public routes include:

- `/`
- `/browse`
- `/gift-cards/[slug]`
- `/brands/[slug]`
- `/categories`
- `/categories/[slug]`
- `/occasions`
- `/occasions/[slug]`
- `/regions`
- `/register-store`
- `/go/[id]` for controlled outbound merchant navigation

## Admin product

The application includes an admin area covering:

- analytics
- catalog creation and editing
- merchants
- gift cards
- bulk operations
- discovery
- duplicates and merge tools
- homepage content
- media
- pipeline controls
- quality
- readiness
- remediation
- SEO
- sources
- taxonomy
- verification
- settings

Admin access is protected through environment-based credentials used by `proxy.ts`.

## Setup

### Requirements

- Node.js >= 20.19.0
- PostgreSQL-compatible database
- npm or pnpm

The repository currently contains both `package-lock.json` and `pnpm-lock.yaml`. Before long-term maintenance or transfer, select one package manager as canonical and remove the other lockfile.

### Install

Using npm:

```bash
npm install
```

or pnpm:

```bash
pnpm install
```

### Configure environment

Copy:

```bash
cp .env.example .env.local
```

Then populate the required values.

The minimum runtime configuration is typically:

```env
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
ADMIN_USER=
ADMIN_PASSWORD=
```

Analytics is optional:

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

Most remaining variables are used only by discovery, verification, audit, or reconciliation scripts.

### Database

Generate Prisma artifacts as required by the installed Prisma version, then apply the project's normal schema deployment process.

Seed data is available through:

```bash
npm run db:seed
```

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
npm run start
```

## Useful scripts

Core:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:seed
```

Catalog quality:

```bash
npm run audit:catalog
```

Pipeline commands include discovery, verification, canonicalization, promotion, rediscovery, review, validation, re-verification, and diagnostics. See `OPERATIONS.md` before running data-changing scripts.

## Documentation

- `ARCHITECTURE.md` — application and data architecture
- `DEPLOYMENT.md` — deployment and environment setup
- `OPERATIONS.md` — operational and maintenance workflows
- `HANDOVER.md` — transfer checklist for a new owner
- `SECURITY.md` — security and credential handling
- `.env.example` — environment variable inventory without secrets

## Transfer principle

The application is designed to be transferable without requiring the original developer's workstation. A buyer should receive:

- source repository
- production hosting ownership/access
- database ownership/access
- DNS/domain ownership
- analytics/search ownership
- required API credentials
- admin credentials
- environment-variable inventory
- deployment instructions
- operational documentation

No secret values should ever be committed to Git.
