DOROKARTES — MERCHANT ACTIVATION & AUTOMATED FOLLOW-UP V1

Adds:
- /admin/activation activation funnel + due queue
- manual single reminder and "send all due now"
- daily Vercel Cron endpoint /api/cron/merchant-followups
- automatic reminders for:
  1) approved merchant who has not activated portal after 2 days
  2) activated portal with no active subscription after 2 days
- 4-day repeat spacing
- hard cap of 6 automated follow-ups per lead
- follow-up timestamps/count stored on MerchantLead
- active subscription immediately stops activation reminders
- past-due/suspended accounts are not emailed by this flow

INSTALL
1) Extract over D:\dorokartes
2) Run:
   node scripts/install-merchant-activation-v1.mjs
3) Run:
   npx prisma migrate deploy
   npx prisma generate
   npm run build

VERCEL ENV REQUIRED FOR AUTOMATIC DAILY RUN
CRON_SECRET=<long-random-secret>

Vercel Cron schedule in vercel.json:
15 7 * * *  (daily 07:15 UTC)

Manual admin sending works independently through /admin/activation.
No homepage/public CSS or root app/layout.tsx changes.
