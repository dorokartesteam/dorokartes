Dorokartes Merchant Portal UI V3
================================

Scope: visual redesign only.
No changes to Stripe, auth, Prisma, merchant sessions or billing logic.

Install from D:\dorokartes:

Expand-Archive -Path "$HOME\Downloads\dorokartes-merchant-ui-v3.zip" -DestinationPath "D:\dorokartes" -Force
npm run build

Review locally / production after deploy:
- /merchant
- /merchant/profile
- /merchant/gift-cards
- /merchant/analytics
- /merchant/billing
- /merchant/login

If build passes, commit/push normally.
