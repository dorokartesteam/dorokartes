# BestPrice Harvester v2.2 hotfix

Fixes both previous extraction failures:

- `ReferenceError: __name is not defined`
- `esbuild Syntax error "`"`

v2.2 removes `page.evaluate()` from product extraction completely.

The dynamic catalog is still loaded in Chromium, but product/merchant extraction
is performed from Node through Playwright locators. That avoids tsx/esbuild
serialization issues inside the browser context.

## Apply

Extract over `D:\dorokartes`, then run:

```powershell
node scripts/pipeline/patch-bestprice-v2.2.mjs
```

Then:

```powershell
npm run pipeline:harvest-bestprice -- --apply --no-merchant-resolution
```

No migration, npm install, Prisma generate, or Playwright reinstall is needed.

Do not use `--import` until the deduplicated product and merchant counts look plausible.
