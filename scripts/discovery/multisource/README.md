# Multi-Source Collector v1

This collector merges discoveries from multiple sources before verification.

Supported input formats:

- `.json`
- `.csv`

Put source files under:

`data/discovery/sources/`

Examples:

- `bestprice.csv`
- `skroutz.csv`
- `wolt.csv`
- `baladeur.csv`
- `google-search.csv`
- `manual.json`

## CSV columns

```csv
sourceType,sourceName,sourceUrl,title,merchantName,possibleOfficialUrl,notes
AGGREGATOR,BestPrice,https://...,Example Gift Card,Example Merchant,https://example.gr,Found in aggregator
```

## Run collector

```powershell
npm run discovery:collect
```

The collector:

1. loads all CSV/JSON files
2. normalizes merchant names and URLs
3. removes exact duplicates
4. merges duplicate merchants
5. prefers stronger sources
6. stores clean candidates in `DiscoveryItem`

## Export official domains for verifier

```powershell
npm run discovery:export-domains
```

This creates:

`data/discovery/domains-auto.txt`

Then verify them with the website scanner:

```powershell
npm run discovery:domains -- data/discovery/domains-auto.txt
```

## Source priority

1. OFFICIAL
2. AGGREGATOR
3. MARKETPLACE
4. SEARCH_ENGINE
5. MANUAL
6. OTHER
