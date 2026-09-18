# Dorokartes Merchant Logo Enrichment v1 — SAFE

This is intentionally conservative.

It fills `merchant.logoUrl` only from each merchant's own official website/domain.

## Sources checked

Priority order:
1. JSON-LD `logo`
2. `<img>` elements clearly marked as logo/brand
3. Open Graph image
4. Twitter image
5. Apple touch icon
6. favicon/icon

## Safety rules

A logo is auto-applied only when:
- the merchant already has an official `websiteUrl`
- the image is hosted on the same merchant domain or subdomain
- it is a real image response
- it has a strong logo score
- it beats the second candidate by a margin
- it does not look like payment/social/placeholder/sprite imagery

Anything ambiguous prints `REVIEW` and is NOT changed.

Existing `logoUrl` values are not overwritten.

## Preview first

```powershell
node --env-file=.env --import tsx scripts/pipeline/admin/enrich-merchant-logos-v1.ts
```

Test a small batch:

```powershell
node --env-file=.env --import tsx scripts/pipeline/admin/enrich-merchant-logos-v1.ts --limit=25
```

## Apply only after checking preview

```powershell
node --env-file=.env --import tsx scripts/pipeline/admin/enrich-merchant-logos-v1.ts --apply
```

Every applied row is printed as `UPDATED`.
