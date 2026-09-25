Dorokartes Merchant Onboarding v1

What it adds
- Self-service onboarding checklist on /merchant
- Progress based on real portal/profile/gift-card/subscription state
- First-activation welcome email via the existing merchant Resend sender
- First invite activation redirects to /merchant?welcome=1
- No Prisma migration
- Does not touch public homepage/layout/favicon CSS

Install after extraction:
  node scripts/install-merchant-onboarding-v1.mjs
  npm run build
