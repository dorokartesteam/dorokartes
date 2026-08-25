# Dorokartes Manual Override + Superseded Trigger Fix

The latest run exposed two real bugs.

## Bug 1 — manual overrides were checked too late

Sephora and Hondos had valid `ManualVerificationOverride` rows, but the verifier ran
fetch/preflight first. Because those pages are BLOCKED / ACCESS_DENIED, execution
continued before the manual override lookup.

Fix:

- `lockUntilContentChanges=false` manual overrides now run BEFORE any fetch/preflight.
- This means source-backed manual verification of blocked official pages consumes:
  - 0 Playwright calls
  - 0 LLM calls

Hash-bound manual overrides (`lockUntilContentChanges=true`) still run later because
they need current page content to compare the hash.

## Bug 2 — old rediscovery trigger URLs came back after task resolution

Germanos old dead product URL and HomeMarkt TERMS URL re-entered the verifier because
their rediscovery tasks became RESOLVED, and the existing skip logic only skipped open tasks.

Fix:

- all rediscovery trigger URLs remain skipped even after the task becomes RESOLVED.
- a superseded/dead trigger URL never re-enters normal verification.

## Install

Copy over `D:\dorokartes`, then run:

```powershell
node scripts/pipeline/patch-manual-override-superseded.mjs
```

No migration. No Prisma generate.

## Apply the existing manual overrides

Now run:

```powershell
npm run pipeline:verify -- --apply
```

Expected current behavior:

```text
Sephora
  -> VERIFIED UNCONDITIONAL_MANUAL_LOCK role=CHECKOUT

Hondos Center
  -> VERIFIED UNCONDITIONAL_MANUAL_LOCK role=CANONICAL_PURCHASE

NEW LLM calls: 0
```

The old Germanos/HomeMarkt trigger URLs should no longer appear.

Then:

```powershell
npm run pipeline:rediscovery-reconcile
```

Expected:

```text
[RESOLVABLE] Sephora
[RESOLVABLE] Hondos Center
```

Then:

```powershell
npm run pipeline:rediscovery-reconcile -- --apply
npm run pipeline:rediscovery-summary
```

Target:

```text
Open rediscovery tasks: 0
```
