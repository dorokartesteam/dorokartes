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
