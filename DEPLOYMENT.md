# Deployment

## Requirements

- Node.js >= 20.19.0
- PostgreSQL-compatible database
- repository access
- production environment variables
- domain/DNS access
- hosting access

The project contains both `package-lock.json` and `pnpm-lock.yaml` while `package.json` does not currently declare a `packageManager`. Before transfer, choose one package manager as canonical.

## Recommended production topology

A simple production topology is:

- Next.js application hosting
- PostgreSQL database
- public domain pointing to the application
- environment variables stored in the hosting provider
- optional Google Analytics
- optional external discovery APIs for maintenance scripts

The repository contains Vercel-related runtime references and is compatible with a Vercel-style Next.js deployment workflow.

## Environment variables

Minimum runtime variables:

```env
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
ADMIN_USER=
ADMIN_PASSWORD=
```

Optional runtime analytics:

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

Pipeline and audit variables are documented in `.env.example`.

Do not copy secrets into documentation, tickets, screenshots, Git history, or buyer-facing due-diligence material.

## Fresh local setup

Using npm:

```bash
npm install
```

Then:

```bash
cp .env.example .env.local
```

Populate required values.

Start development:

```bash
npm run dev
```

## Build validation

Before every production deployment:

```bash
npm run lint
npm run build
```

The production build must pass without enabling broad TypeScript error suppression.

## Database

The application uses Prisma with PostgreSQL.

Primary schema:

```text
prisma/schema.prisma
```

Database access is configured through:

```env
DATABASE_URL=
```

The repository includes:

```bash
npm run db:seed
```

Do not run seed or destructive migration/data-cleanup scripts against production without first understanding their scope.

## Production deployment checklist

Before deployment:

- pull the intended Git commit
- confirm environment variables
- confirm database target
- run lint
- run production build
- review Prisma/schema changes
- confirm canonical application URL
- confirm admin credentials exist
- confirm public sitemap/robots behavior
- confirm `/go/[id]` outbound redirects
- confirm gift-card and brand detail pages
- confirm `/browse`
- confirm admin area access

After deployment:

- open homepage
- search for a known brand
- open a gift-card detail page
- open a brand page
- test browse pagination
- test one outbound merchant link
- test admin authentication
- verify sitemap and robots endpoints
- verify analytics only if configured

## Domain transfer

A buyer handover should explicitly include:

- registrar account ownership
- DNS provider ownership
- production DNS records
- SSL/TLS status
- canonical domain
- redirect behavior between host variants

The application URL should be reflected in `NEXT_PUBLIC_APP_URL`.

## Hosting transfer

For a hosting-account transfer:

1. add buyer as owner/admin
2. duplicate or transfer project ownership
3. move environment variables through the provider's secure UI
4. confirm production domain
5. confirm database connectivity
6. deploy from the buyer-controlled Git repository/account
7. remove seller access after acceptance

## Database transfer

Preferred options:

- transfer ownership of the existing database project/account, or
- create a buyer-controlled database and migrate the data

Before migration:

- create a backup
- record current row counts
- stop writes if a consistent snapshot is required
- migrate
- validate counts and application reads
- test admin writes
- only then retire old credentials

## Rollback

A rollback plan should preserve:

- previous Git commit
- previous production deployment
- pre-change database backup for data-changing releases

Code rollback is not a substitute for restoring unintended database mutations.
