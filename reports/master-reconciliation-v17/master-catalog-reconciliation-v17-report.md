# Dorokartes Master Catalog Reconciliation v17

- Generated: 2026-09-21T12:46:09.040Z
- Plan ID: `34b29180f80ae20c61c62f950118c56475c72cc204797d795312d17f687aea02`
- Catalog fingerprint: `0c56c1bccf86cbb5509e7ab814810d9463fd2a4c3cda129be0b7ab023b73970e`
- Active gift cards: 1120
- Total detected issues: 5928
- v11 guarded actions: 0
- v11 review cards: 72
- v11 clean/unaffected: 1048
- Denomination evidence: safe=0, supported=12, review=85, error=10

| Priority | Disposition | Code | Count | Note |
|---|---|---|---:|---|
| P0 | REVIEW | DUPLICATE_OR_DOMAIN_MISMATCH | 3 | Requires canonical-program verification; never auto-merged by the master layer. |
| P0 | REVIEW | V11_REVIEW_CARDS | 72 | Identity/title/denomination review items deliberately withheld by v11 safety rules. |
| P1 | BACKLOG | ACTIVE_CARD_NOT_VERIFIED | 500 | Verification evidence gap. Prioritize before cosmetic SEO work. |
| P1 | ERROR | DENOM_ERROR | 10 | Fetch/HTTP failures; require browser/manual verification. |
| P1 | REVIEW | DENOM_REVIEW | 85 | Insufficient or conflicting live evidence. |
| P1 | KEEP_AS_IS | DENOM_SUPPORTED_AS_IS | 12 | Official page supports card/value identity but not enough evidence for automatic variant creation. |
| P1 | ERROR | LATEST_SNAPSHOT_BAD_HTTP | 2 | Needs live/browser verification; HTTP errors never trigger blind URL replacement. |
| P1 | BACKLOG | NO_ACTIVE_VARIANT | 1013 | Variant structure absent. Must be evidence-backed; title amounts alone are not sufficient. |
| P1 | BACKLOG | NO_OCCASION | 1011 | Catalog taxonomy/occasion coverage gap. |
| P1 | BACKLOG | NO_OFFICIAL_CARD_SOURCE | 501 | Active card lacks active OFFICIAL SourceRecord. |
| P1 | BACKLOG | NO_OFFICIAL_MERCHANT_SOURCE | 503 | Merchant lacks active OFFICIAL source evidence. |
| P2 | BACKLOG | LOGO_MISSING | 32 | Canonical local merchant logo missing. |
| P2 | REVIEW | LOGO_SOURCE_DOMAIN_MISMATCH | 56 | Logo source host differs from merchant host; verify provenance before replacement. |
| P3 | BACKLOG | MISSING_META_DESCRIPTION | 1120 | SEO metadata gap; safe to address after catalog identity/source correctness. |
| P3 | BACKLOG | MISSING_SEO_TITLE | 1120 | SEO metadata gap; safe to address after catalog identity/source correctness. |
| P3 | REVIEW | VERY_SPECIFIC_OFFICIAL_URL | 54 | Specific gift-card URLs are often correct; review, do not root-normalize blindly. |

## Write policy

- Master v17 is an orchestration/reconciliation layer. It does not invent business data.
- --apply delegates only current v11 guarded actions. Denomination/source/logo/SEO findings remain report-only until a dedicated evidence-backed remediator exists.
- No blind slug normalization, duplicate deletion, URL root-normalization, or verification promotion is performed.
