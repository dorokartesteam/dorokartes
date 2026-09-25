DOROKARTES MERCHANT ACQUISITION V1

Adds:
- "Claim this business" CTA on public brand pages that do not yet have a Merchant Portal member.
- /register-store?claim=<merchant-slug> claim flow.
- Existing merchant is automatically matched to the lead and placed UNDER_REVIEW.
- Claim validation blocks merchants that already have portal members.
- Admin one-click follow-up email from Merchant Lead review.
- Approved lead follow-up generates a fresh 15-minute Merchant Portal login link.

No Prisma migration.
No app/layout.tsx changes.
No homepage CSS changes.

Install:
Expand over D:\dorokartes, then run npm run build.
