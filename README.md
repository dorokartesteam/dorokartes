# Dorokartes Full Catalog Classifier v10

Runs across all 1,135 gift-card rows and turns the v9 issue audit into actionable buckets:

- AUTO_RECOVER_MERCHANT
- TITLE_ONLY_CLEANUP
- GENERAL_URL_CANDIDATE
- POSSIBLE_DUPLICATE_PROGRAM
- THIRD_PARTY_CARD
- GENERIC_OR_UNCLEAR
- CLEAN

No DB changes.

Run:

```powershell
node --env-file=.env --import tsx scripts/pipeline/admin/classify-full-catalog-v10.ts
```

Outputs:

```text
reports/full-catalog-classifier-v10.json
reports/full-catalog-classifier-v10.csv
```

Send back the bucket counts.
