# Dorokartes Unified Pipeline

This package is a REORGANIZATION of the working pipeline, not a rewrite from zero.

It keeps the behavior that has already been proven:
- HTTP + Playwright fetch
- conservative preflight
- content-hash cache
- manual verification overrides before blocked-page fetch
- rediscovery trigger suppression
- search-assisted discovery
- immutable semantic verification attempts
- production review flags
- naming validation

It adds stable operational entry points and removes old v1/v2/fix commands from active npm scripts.

## Stable commands

```powershell
npm run pipeline:discover
npm run pipeline:verify
npm run pipeline:rediscover
npm run pipeline:canonicalize
npm run pipeline:promote
npm run pipeline:reverify
npm run pipeline:review
npm run pipeline:validate
npm run pipeline:test
```

## Non-core admin/diagnostic tools

```powershell
npm run pipeline:governance
npm run pipeline:rediscovery-reconcile
npm run pipeline:verification-overrides
npm run pipeline:diag:llm
npm run pipeline:diag:content
npm run pipeline:diag:preflight
```

## Install

You should already be on your checkpoint branch/tag before applying this package.

Copy this package over `D:\dorokartes`, then run:

```powershell
node scripts/pipeline/install-unified.mjs
npm run pipeline:test
npm run pipeline:validate
npm run pipeline:verify
npm run pipeline:review
```

The installer creates `package.pre-unified.json` before replacing active npm scripts.

No Prisma migration is included or required by this cleanup package.

## Behavior guarantees

### Verify

`pipeline:verify` is the SAME mature verifier logic reorganized under `commands/`.
It preserves:
- open/superseded rediscovery URL skip
- unconditional manual overrides before fetch
- preflight gate before LLM
- exact content-hash/model/prompt cache
- token logging
- production role-change review guard

### Canonicalize

The new stable canonicalizer is intentionally safer than old v2.1:
- uses the active `ScoringModelVersion`
- reads `ManualCanonicalOverride`
- uses semantic page role when available
- chooses canonical winners ONLY from VERIFIED candidates
- never demotes queued/discovered candidates
- on APPLY, writes `CanonicalizationRun` + `CanonicalizationDecision`
- an override URL must itself be VERIFIED or the domain goes to manual review

Dry-run:

```powershell
npm run pipeline:canonicalize
```

Apply:

```powershell
npm run pipeline:canonicalize -- --apply
```

### Promote

The new promoter fixes the historic naming failure:
- `sourceName` is NEVER used as merchant identity
- merchant name comes from canonical override, verified merchantName, or safe domain fallback
- production merchants are matched primarily by registered domain
- canonical URL changes to an existing production card create a review flag
- they do NOT silently overwrite production

Dry-run:

```powershell
npm run pipeline:promote
```

Normal apply:

```powershell
npm run pipeline:promote -- --apply
```

After a human reviews a canonical URL change:

```powershell
npm run pipeline:promote -- --apply --approve-url-changes
```

### Reverify

`pipeline:reverify` is the first production self-healing command.

Default:
- selects ACTIVE + VERIFIED cards whose `nextReviewAt` is due
- HTTP → Playwright if needed
- preflight
- if content hash matches the latest semantic attempt: cheap PASS + nextReviewAt refresh
- if content changed: creates CONTENT_CHANGED review flag, no silent production mutation
- if unavailable: appends VerificationEvent but does not delete/hide the card

Dry-run:

```powershell
npm run pipeline:reverify
```

Apply:

```powershell
npm run pipeline:reverify -- --apply
```

Force a diagnostic scan regardless of nextReviewAt:

```powershell
npm run pipeline:reverify -- --force
```

## Discovery modes

Default search-assisted candidate import:

```powershell
npm run pipeline:discover
npm run pipeline:discover -- --apply
```

Temporary internal access to existing engines during migration:

```powershell
npm run pipeline:discover -- --mass
npm run pipeline:discover -- --collect
```

These do not expose old versioned npm commands.

## What is intentionally NOT included

Taxonomy/category/occasion/persona tagging is NOT part of this refactor.
It should be a separate project after the core data pipeline is stable.

## Legacy files

Old `scripts/discovery/*`, old patch files, and installers are not automatically deleted.
They remain available in Git/history for rollback and comparison, but the unified installer
removes them from active npm operations.

Once the unified regression + production dry-runs are clean, they can be archived or deleted
in a later housekeeping commit.
