Dorokartes Admin - Permanent Merchant Delete v1

Adds a protected Danger Zone on /admin/merchants/[id].

Permanent delete behavior:
- exact merchant-name confirmation + browser confirmation
- cancels Stripe subscription when it exists under the configured Stripe account
- deletes Stripe customer when it exists
- tolerates old Sandbox customer/subscription IDs returning resource_missing under a Live key
- removes matched MerchantLead records
- removes SourceRecord and OutboundClick rows linked to merchant/gift cards
- deleting Merchant cascades gift cards, variants, values, locations, media, portal members,
  sessions, magic links, MerchantSubscription and PremiumPlacement records

No Prisma migration is required.

Install by extracting this zip into D:\dorokartes and run npm run build before git push.
