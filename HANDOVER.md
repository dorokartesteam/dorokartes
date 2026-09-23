# Buyer Handover

This document is the transfer checklist for Dorokartes.gr.

## 1. Asset scope

Transfer should clearly identify whether the sale includes:

- source code
- Git repository and history
- production domain
- DNS
- hosting project
- production database
- catalog data
- merchant/gift-card media assets
- analytics property
- Search Console property
- social accounts
- email accounts
- API accounts/credits
- brand assets
- documentation
- any registered company/trademark rights, if separately agreed

Do not assume an account or license transfers merely because its integration appears in source code.

## 2. Technical baseline

At the latest catalog audit:

- 1,129 active gift cards
- 1,077 verified active gift cards
- 1,130 active merchants
- 1,107 local canonical merchant logos
- 0 blocker-level catalog issues
- 0 verified active gift cards missing an active OFFICIAL source

The repository contains:

- Next.js public application
- admin interface
- Prisma/PostgreSQL data layer
- discovery and verification pipeline
- catalog audits
- reconciliation and remediation scripts
- SEO landing structure

## 3. Access inventory

Before closing the transfer, create a private credential inventory for:

- domain registrar
- DNS provider
- Git hosting
- production hosting
- database provider
- Google Analytics
- Google Search Console
- email provider
- OpenAI, if pipeline use is transferred
- Serper, if discovery use is transferred
- any other active API or storage service

Never put passwords, API keys, private tokens, or database credentials in this file or in Git.

## 4. Repository handover

Buyer should receive:

- repository ownership or buyer-controlled fork
- default branch information
- current production commit
- branch protection settings, if used
- access to deployment integration

After transfer:

```bash
npm install
npm run lint
npm run build
```

Buyer should be able to produce a clean build independently.

## 5. Environment handover

Use `.env.example` as the variable inventory.

Core runtime variables:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- optional `NEXT_PUBLIC_GA_MEASUREMENT_ID`

Pipeline variables should be transferred only if the buyer is taking over those workflows.

## 6. Database handover

Buyer should receive either:

- ownership of the existing production database, or
- a migrated copy in a buyer-owned database

Acceptance checks:

- app connects successfully
- public catalog counts are plausible
- gift-card pages load
- admin reads work
- admin writes work
- source/provenance records remain intact

## 7. Hosting handover

Buyer should be able to:

- view deployments
- change environment variables
- deploy from Git
- attach/detach domains
- inspect build logs
- roll back a deployment

Seller access can be removed after buyer acceptance.

## 8. Domain and DNS

Transfer:

- registrar ownership
- DNS access
- production records
- domain renewal responsibility
- any redirect domains/subdomains

Confirm `NEXT_PUBLIC_APP_URL` after transfer.

## 9. Analytics and SEO

If included:

- transfer Google Analytics access/ownership
- transfer Search Console access/ownership
- verify production domain
- verify sitemap submission
- preserve historical traffic data where the platform allows it

Historical organic traffic and indexation data can materially support buyer due diligence.

## 10. Admin acceptance test

Buyer should demonstrate:

- admin login
- merchant lookup
- gift-card lookup
- source/provenance lookup
- verification view
- catalog quality/readiness view
- safe edit on a non-critical test record or agreed production record

## 11. Public acceptance test

Buyer should demonstrate:

- homepage
- search
- browse
- pagination
- gift-card page
- brand page
- category page
- occasion page
- outbound merchant redirect
- sitemap
- robots

## 12. Operational knowledge transfer

Buyer should understand:

- verified vs review/pending statuses
- OFFICIAL source lineage
- how catalog audits work
- why not every audit warning should be "fixed"
- which scripts are current operational tools
- which scripts are historical migrations/cleanup tools
- how to back up before bulk changes
- how to run preview/apply/post-audit workflows

## 13. External integration review

Source inventory detected references to:

- Prisma/PostgreSQL
- Neon
- Vercel
- OpenAI
- Google Analytics
- Serper-related discovery tooling
- NextAuth/Auth.js
- Resend
- Stripe
- Sentry
- UploadThing
- Upstash
- Supabase
- Cloudflare

Not every detected reference is necessarily an active production dependency. During handover, classify each as:

- active and required
- active but optional
- historical/unused
- to be removed

Only active services should be transferred and documented as dependencies.

## 14. Security reset at closing

At or immediately after closing:

- rotate database credentials
- rotate admin password
- rotate API keys transferred to buyer
- remove seller sessions
- remove seller hosting access
- remove seller database access
- remove seller Git access if appropriate
- review DNS/account recovery email addresses
- enable MFA on buyer-controlled services

## 15. Final deliverables

Recommended final handover package:

- source repository
- `README.md`
- `.env.example`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `OPERATIONS.md`
- `SECURITY.md`
- this `HANDOVER.md`
- latest catalog audit
- latest verification/provenance audit
- production database backup
- private credential inventory
- asset metrics snapshot
- ownership-transfer confirmation for domain/hosting/database/analytics

## 16. Acceptance

The transfer is technically complete when the buyer can independently:

1. clone the repository
2. configure a fresh environment
3. connect to a buyer-controlled database
4. build the application
5. deploy it
6. access admin
7. operate the catalog
8. run a catalog audit
9. control the domain and production hosting
10. rotate all sensitive credentials without seller assistance
