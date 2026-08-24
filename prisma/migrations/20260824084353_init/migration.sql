-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'NEEDS_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('DRAFT', 'ACTIVE', 'HIDDEN', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DISCOVERED', 'PENDING', 'VERIFIED', 'NEEDS_REVIEW', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GiftCardVariantType" AS ENUM ('DIGITAL', 'PHYSICAL', 'DIGITAL_AND_PHYSICAL', 'CORPORATE', 'EXPERIENCE', 'THIRD_PARTY_PREPAID');

-- CreateEnum
CREATE TYPE "RedemptionChannel" AS ENUM ('ONLINE', 'PHYSICAL_STORE', 'APP', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('EMAIL', 'SMS', 'VIBER', 'PHYSICAL_DELIVERY', 'STORE_PICKUP', 'INSTANT_CODE', 'PRINTABLE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL', 'AGGREGATOR', 'SEARCH_ENGINE', 'MARKETPLACE', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('DISCOVERED', 'QUEUED', 'VERIFYING', 'VERIFIED', 'REJECTED', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('PASSED', 'FAILED', 'CHANGED', 'UNAVAILABLE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "MediaUsageStatus" AS ENUM ('UNKNOWN', 'APPROVED', 'OWNED', 'GENERATED', 'DO_NOT_USE');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "description" TEXT,
    "websiteUrl" TEXT,
    "country" TEXT NOT NULL DEFAULT 'GR',
    "logoUrl" TEXT,
    "logoSourceUrl" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "officialUrl" TEXT,
    "corporateAvailable" BOOLEAN NOT NULL DEFAULT false,
    "personalizationAvailable" BOOLEAN NOT NULL DEFAULT false,
    "validityMonths" INTEGER,
    "validityText" TEXT,
    "termsUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardVariant" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "name" TEXT,
    "type" "GiftCardVariantType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "minValue" DECIMAL(12,2),
    "maxValue" DECIMAL(12,2),
    "customValueAllowed" BOOLEAN NOT NULL DEFAULT false,
    "purchaseUrl" TEXT,
    "validityMonths" INTEGER,
    "validityText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardValue" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardRedemption" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "channel" "RedemptionChannel" NOT NULL,

    CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardDelivery" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "method" "DeliveryMethod" NOT NULL,

    CONSTRAINT "GiftCardDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardCategory" (
    "giftCardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GiftCardCategory_pkey" PRIMARY KEY ("giftCardId","categoryId")
);

-- CreateTable
CREATE TABLE "Occasion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardOccasion" (
    "giftCardId" TEXT NOT NULL,
    "occasionId" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "GiftCardOccasion_pkey" PRIMARY KEY ("giftCardId","occasionId")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "merchantId" TEXT,
    "giftCardId" TEXT,
    "externalId" TEXT,
    "rawTitle" TEXT,
    "rawDescription" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryItem" (
    "id" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT,
    "merchantName" TEXT,
    "status" "DiscoveryStatus" NOT NULL DEFAULT 'DISCOVERED',
    "possibleOfficialUrl" TEXT,
    "fingerprint" TEXT,
    "notes" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "giftCardId" TEXT,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "altText" TEXT,
    "usageStatus" "MediaUsageStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundClick" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "giftCardId" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "sessionId" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "source" TEXT,
    "campaign" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "baseUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "totalDiscovered" INTEGER NOT NULL DEFAULT 0,
    "totalImported" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "itemsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "successful" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "clickedGiftCardId" TEXT,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

-- CreateIndex
CREATE INDEX "Merchant_name_idx" ON "Merchant"("name");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Merchant_featured_idx" ON "Merchant"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_slug_key" ON "GiftCard"("slug");

-- CreateIndex
CREATE INDEX "GiftCard_merchantId_idx" ON "GiftCard"("merchantId");

-- CreateIndex
CREATE INDEX "GiftCard_status_idx" ON "GiftCard"("status");

-- CreateIndex
CREATE INDEX "GiftCard_verificationStatus_idx" ON "GiftCard"("verificationStatus");

-- CreateIndex
CREATE INDEX "GiftCard_featured_idx" ON "GiftCard"("featured");

-- CreateIndex
CREATE INDEX "GiftCard_lastVerifiedAt_idx" ON "GiftCard"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "GiftCardVariant_giftCardId_idx" ON "GiftCardVariant"("giftCardId");

-- CreateIndex
CREATE INDEX "GiftCardVariant_type_idx" ON "GiftCardVariant"("type");

-- CreateIndex
CREATE INDEX "GiftCardVariant_active_idx" ON "GiftCardVariant"("active");

-- CreateIndex
CREATE INDEX "GiftCardValue_variantId_idx" ON "GiftCardValue"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardValue_variantId_value_key" ON "GiftCardValue"("variantId", "value");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_channel_idx" ON "GiftCardRedemption"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardRedemption_variantId_channel_key" ON "GiftCardRedemption"("variantId", "channel");

-- CreateIndex
CREATE INDEX "GiftCardDelivery_method_idx" ON "GiftCardDelivery"("method");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardDelivery_variantId_method_key" ON "GiftCardDelivery"("variantId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_idx" ON "Category"("active");

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- CreateIndex
CREATE INDEX "GiftCardCategory_categoryId_idx" ON "GiftCardCategory"("categoryId");

-- CreateIndex
CREATE INDEX "GiftCardCategory_primary_idx" ON "GiftCardCategory"("primary");

-- CreateIndex
CREATE UNIQUE INDEX "Occasion_slug_key" ON "Occasion"("slug");

-- CreateIndex
CREATE INDEX "Occasion_active_idx" ON "Occasion"("active");

-- CreateIndex
CREATE INDEX "Occasion_sortOrder_idx" ON "Occasion"("sortOrder");

-- CreateIndex
CREATE INDEX "GiftCardOccasion_occasionId_idx" ON "GiftCardOccasion"("occasionId");

-- CreateIndex
CREATE INDEX "GiftCardOccasion_relevance_idx" ON "GiftCardOccasion"("relevance");

-- CreateIndex
CREATE INDEX "SourceRecord_sourceType_idx" ON "SourceRecord"("sourceType");

-- CreateIndex
CREATE INDEX "SourceRecord_sourceName_idx" ON "SourceRecord"("sourceName");

-- CreateIndex
CREATE INDEX "SourceRecord_merchantId_idx" ON "SourceRecord"("merchantId");

-- CreateIndex
CREATE INDEX "SourceRecord_giftCardId_idx" ON "SourceRecord"("giftCardId");

-- CreateIndex
CREATE INDEX "SourceRecord_lastSeenAt_idx" ON "SourceRecord"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryItem_fingerprint_key" ON "DiscoveryItem"("fingerprint");

-- CreateIndex
CREATE INDEX "DiscoveryItem_status_idx" ON "DiscoveryItem"("status");

-- CreateIndex
CREATE INDEX "DiscoveryItem_sourceType_idx" ON "DiscoveryItem"("sourceType");

-- CreateIndex
CREATE INDEX "DiscoveryItem_merchantName_idx" ON "DiscoveryItem"("merchantName");

-- CreateIndex
CREATE INDEX "DiscoveryItem_discoveredAt_idx" ON "DiscoveryItem"("discoveredAt");

-- CreateIndex
CREATE INDEX "VerificationEvent_giftCardId_idx" ON "VerificationEvent"("giftCardId");

-- CreateIndex
CREATE INDEX "VerificationEvent_result_idx" ON "VerificationEvent"("result");

-- CreateIndex
CREATE INDEX "VerificationEvent_checkedAt_idx" ON "VerificationEvent"("checkedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_merchantId_idx" ON "MediaAsset"("merchantId");

-- CreateIndex
CREATE INDEX "MediaAsset_giftCardId_idx" ON "MediaAsset"("giftCardId");

-- CreateIndex
CREATE INDEX "MediaAsset_usageStatus_idx" ON "MediaAsset"("usageStatus");

-- CreateIndex
CREATE INDEX "OutboundClick_merchantId_idx" ON "OutboundClick"("merchantId");

-- CreateIndex
CREATE INDEX "OutboundClick_giftCardId_idx" ON "OutboundClick"("giftCardId");

-- CreateIndex
CREATE INDEX "OutboundClick_clickedAt_idx" ON "OutboundClick"("clickedAt");

-- CreateIndex
CREATE INDEX "OutboundClick_source_idx" ON "OutboundClick"("source");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_name_key" ON "ImportSource"("name");

-- CreateIndex
CREATE INDEX "ImportSource_enabled_idx" ON "ImportSource"("enabled");

-- CreateIndex
CREATE INDEX "CrawlJob_sourceName_idx" ON "CrawlJob"("sourceName");

-- CreateIndex
CREATE INDEX "CrawlJob_startedAt_idx" ON "CrawlJob"("startedAt");

-- CreateIndex
CREATE INDEX "SearchEvent_searchedAt_idx" ON "SearchEvent"("searchedAt");

-- CreateIndex
CREATE INDEX "SearchEvent_query_idx" ON "SearchEvent"("query");

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardVariant" ADD CONSTRAINT "GiftCardVariant_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardValue" ADD CONSTRAINT "GiftCardValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GiftCardVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GiftCardVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardDelivery" ADD CONSTRAINT "GiftCardDelivery_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GiftCardVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardCategory" ADD CONSTRAINT "GiftCardCategory_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardCategory" ADD CONSTRAINT "GiftCardCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardOccasion" ADD CONSTRAINT "GiftCardOccasion_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardOccasion" ADD CONSTRAINT "GiftCardOccasion_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "Occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundClick" ADD CONSTRAINT "OutboundClick_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundClick" ADD CONSTRAINT "OutboundClick_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
