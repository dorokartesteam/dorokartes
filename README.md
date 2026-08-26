# Dorokartes Google Wave2 Clean + Import v1

Processes:

```text
data/discovery/google/google-serper-wave2-domains-v4.csv
```

It:
- checks production DB first;
- checks existing DiscoveryItems;
- applies a strict deterministic quality filter;
- separates into `HIGH_SAFE`, `REVIEW`, `REJECT`;
- optionally imports only `HIGH_SAFE`.

No web calls, no Serper calls, no OpenAI.

## Install

```powershell
node scripts/pipeline/install-google-wave2-clean-v1.mjs
```

## PLAN

```powershell
npm run pipeline:clean-google-wave2
```

## Write CSV

```powershell
npm run pipeline:clean-google-wave2 -- --apply
```

## Import only HIGH_SAFE

```powershell
npm run pipeline:clean-google-wave2 -- --apply --import-safe
```

Output:

```text
data/discovery/google/google-wave2-clean-v1.csv
```
