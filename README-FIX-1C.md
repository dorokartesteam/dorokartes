# Dorokartes Fix 1C — SportCafe merchant merge

Dry-run:

```powershell
npx tsx scripts/cleanup/merchant-identity-fix-1c-sportcafe.ts
```

Apply only after reviewing the dry-run:

```powershell
npx tsx scripts/cleanup/merchant-identity-fix-1c-sportcafe.ts --apply
```

This fix:
- keeps merchant `cmta1gxff007fq8iy28qeo2n2` (`sportcafe`, `sportcafe.gr`)
- moves merchant-level relations from `cmta4yf3d000ysciy2zdlqyzw`
- deletes only the emptied duplicate merchant
- does NOT delete/merge either gift card
- does NOT change slugs, URLs, logos, verification, SEO, or card-level relations
- aborts apply if MerchantLocation unique-key conflicts exist
