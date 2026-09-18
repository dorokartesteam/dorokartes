CREATE TYPE "LocationCapabilityType" AS ENUM (
  'PURCHASE_IN_STORE',
  'REDEEM_IN_STORE'
);

CREATE TABLE "MerchantLocation" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "label" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'GR',
  "administrativeArea" TEXT,
  "city" TEXT NOT NULL,
  "area" TEXT,
  "addressLine" TEXT NOT NULL,
  "postalCode" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "normalizedKey" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceExcerpt" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'DISCOVERED',
  "lastVerifiedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCardLocationCapability" (
  "id" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "merchantLocationId" TEXT NOT NULL,
  "capability" "LocationCapabilityType" NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'DISCOVERED',
  "sourceUrl" TEXT NOT NULL,
  "sourceExcerpt" TEXT,
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCardLocationCapability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MerchantLocation_countryCode_administrativeArea_city_idx"
ON "MerchantLocation"("countryCode", "administrativeArea", "city");

CREATE INDEX "MerchantLocation_city_area_idx"
ON "MerchantLocation"("city", "area");

CREATE INDEX "MerchantLocation_verificationStatus_active_idx"
ON "MerchantLocation"("verificationStatus", "active");

CREATE UNIQUE INDEX "MerchantLocation_merchantId_normalizedKey_key"
ON "MerchantLocation"("merchantId", "normalizedKey");

CREATE INDEX "GiftCardLocationCapability_merchantLocationId_capability_av_idx"
ON "GiftCardLocationCapability"("merchantLocationId", "capability", "available");

CREATE INDEX "GiftCardLocationCapability_giftCardId_capability_available_idx"
ON "GiftCardLocationCapability"("giftCardId", "capability", "available");

CREATE INDEX "GiftCardLocationCapability_verificationStatus_idx"
ON "GiftCardLocationCapability"("verificationStatus");

CREATE UNIQUE INDEX "GiftCardLocationCapability_giftCardId_merchantLocationId_ca_key"
ON "GiftCardLocationCapability"("giftCardId", "merchantLocationId", "capability");

ALTER TABLE "MerchantLocation"
ADD CONSTRAINT "MerchantLocation_merchantId_fkey"
FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiftCardLocationCapability"
ADD CONSTRAINT "GiftCardLocationCapability_giftCardId_fkey"
FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiftCardLocationCapability"
ADD CONSTRAINT "GiftCardLocationCapability_merchantLocationId_fkey"
FOREIGN KEY ("merchantLocationId") REFERENCES "MerchantLocation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
