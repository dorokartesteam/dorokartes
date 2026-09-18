# Location architecture: existing schema and proposed use

Reviewed 2026-09-15 against `prisma/schema.prisma`. This is a proposal only; no schema or location records were changed.

## Existing coverage

`MerchantLocation` already holds merchant, city, area, addressLine, postalCode, latitude/longitude, country, source URL, verification status and review dates. Its merchant/normalizedKey uniqueness constraint supports deduplication.

`GiftCardLocationCapability` already separates `PURCHASE_IN_STORE` from `REDEEM_IN_STORE` for each gift card and location, with evidence and verification. A missing row means unknown; `available=false` is an explicit negative claim.

Variant redemption channels already distinguish online, physical store, app, phone and email. Delivery methods describe how the customer receives the card; they do not prove where the card can be purchased or redeemed.

## Proposed public behavior

- Reuse the existing location models. Show only active locations backed by verified evidence for the claimed capability.
- Present purchase and redemption availability separately. A merchant address alone must never enable a gift-card availability badge or filter.
- Derive physical / online / both separately for purchase and redemption, preserving an unknown state. Do not store one merchant-wide flag that would conflate these claims.
- Treat a variant purchase URL as a link, not proof of online checkout. Online purchase availability needs explicit evidence before it can be used in filters.
- Use city, area and postal code for display/filtering. Use coordinates only when verified; do not fabricate coordinates from city centroids.
- Keep location availability card-specific. If evidence differs by variant, hold that claim until variant-specific representation is agreed.

## Decision before implementation

Keep the current schema for physical locations. Before adding online purchase filters, decide how explicit online purchase evidence and variant-specific exceptions should be represented. No migration is proposed until those requirements are settled.
