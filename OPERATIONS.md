# Operations

## Operating principle

Dorokartes.gr should favor catalog trust over maximum automated coverage.

A card that cannot be safely verified should remain `NEEDS_REVIEW` or `PENDING` rather than being automatically marked verified.

## Current catalog baseline

Latest validated state:

- 1,129 active gift cards
- 1,077 verified active gift cards
- 1,130 active merchants
- 0 blocker-level catalog issues
- 0 verified active gift cards missing an active OFFICIAL source

This baseline should be recorded before future bulk changes.

## Routine checks

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Catalog audit

```bash
npm run audit:catalog
```

The catalog audit is read-only.

## Public smoke test

After meaningful releases:

1. homepage loads
2. search returns expected brands
3. `/browse` works
4. pagination preserves filters/query
5. gift-card detail page loads
6. brand page loads
7. category and occasion landing pages load
8. outbound `/go/[id]` redirects to a valid merchant destination
9. inactive merchants/cards remain protected from public exposure
10. admin authentication still works

## Admin workflows

The admin interface covers:

- merchants
- gift cards
- catalog creation
- bulk changes
- duplicates
- merge operations
- sources
- verification
- taxonomy
- media
- SEO
- quality/readiness
- remediation
- pipeline/discovery controls

Prefer admin workflows for routine catalog management when available.

## Pipeline commands

The codebase contains a large history of data-pipeline scripts.

Primary command families include:

```text
pipeline:discover
pipeline:verify
pipeline:rediscover
pipeline:canonicalize
pipeline:promote
pipeline:reverify
pipeline:review
pipeline:validate
pipeline:test
pipeline:diag:llm
pipeline:diag:content
pipeline:diag:preflight
```

There are also many historical harvest, cleanup, reconciliation, import, and deduplication scripts.

### Safety rule

Do not run an old script solely because it exists.

Before any data-changing script:

1. read the file
2. identify whether it is preview/read-only/apply
3. confirm its target records
4. confirm current database state matches its assumptions
5. prefer a dry-run or generated plan
6. save the plan/audit output
7. apply only the reviewed plan
8. run post-audit
9. commit the script and audit trail if the operation is part of maintained history

## Verification

Verification uses status-based workflow and provenance records.

Important concepts:

- `VerificationStatus`
- `SourceRecord`
- `VerificationEvent`
- production verification snapshots
- review flags
- rediscovery tasks

OFFICIAL source lineage should be preserved for verified records.

## Discovery APIs

Some pipeline tools may use:

- OpenAI
- Serper
- Playwright/browser fetches

These are not required for normal website browsing if the catalog is already populated.

## Analytics

The public app supports a Google Analytics measurement ID through:

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

Outbound behavior is also represented in the data model through `OutboundClick`, while searches are represented through `SearchEvent`.

## Backups

Before bulk database changes:

- create a database backup or restore point
- preserve the generated plan
- preserve pre-change audit counts
- record Git commit
- apply in controlled batches where practical
- run post-audit

## Catalog quality debt

Not every audit warning is a production defect.

Examples that may remain intentionally:

- database-level SEO fields when runtime metadata has deterministic fallbacks
- cards without variants when the merchant sells one flexible gift-card product
- sites that block automated verification with HTTP 403
- unresolved records intentionally left in review status

Do not optimize for an artificial audit score at the cost of incorrect catalog data.

## Incident response

If a public catalog change looks wrong:

1. identify whether the error is application code or database content
2. stop additional bulk scripts
3. capture affected IDs
4. inspect source/provenance records
5. revert code if applicable
6. restore or correct data using a controlled targeted script
7. run audit
8. test public output
9. document the incident

## Ownership cadence

Recommended minimum:

- weekly: public smoke test
- monthly: catalog audit
- monthly: broken outbound URL review
- quarterly: credentials/API-key review
- after major catalog import: full quality + verification audit
