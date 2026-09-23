CREATE TYPE "MerchantLeadStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "MerchantMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "MerchantMemberRole" AS ENUM ('OWNER', 'EDITOR');
CREATE TYPE "MerchantPlan" AS ENUM ('PARTNER', 'FEATURED', 'PREMIUM_BANNER');
CREATE TYPE "MerchantSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "MerchantMagicLinkPurpose" AS ENUM ('INVITE', 'LOGIN');
CREATE TYPE "PremiumPlacementStatus" AS ENUM ('RESERVED', 'ACTIVE', 'ENDED', 'CANCELED');

CREATE TABLE "MerchantLead" (
  "id" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "website" TEXT,
  "businessType" TEXT NOT NULL,
  "region" TEXT,
  "category" TEXT NOT NULL,
  "giftCardStatus" TEXT NOT NULL,
  "giftCardUrl" TEXT,
  "requestedPlan" "MerchantPlan",
  "message" TEXT,
  "status" "MerchantLeadStatus" NOT NULL DEFAULT 'SUBMITTED',
  "matchedMerchantId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MerchantLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantMember" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" "MerchantMemberRole" NOT NULL DEFAULT 'OWNER',
  "status" "MerchantMemberStatus" NOT NULL DEFAULT 'INVITED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MerchantMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantSubscription" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "plan" "MerchantPlan" NOT NULL,
  "status" "MerchantSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MerchantSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantMagicLink" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "purpose" "MerchantMagicLinkPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MerchantMagicLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantSession" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MerchantSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PremiumPlacement" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "status" "PremiumPlacementStatus" NOT NULL DEFAULT 'RESERVED',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PremiumPlacement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MerchantLead_status_createdAt_idx" ON "MerchantLead"("status", "createdAt");
CREATE INDEX "MerchantLead_email_idx" ON "MerchantLead"("email");
CREATE INDEX "MerchantLead_matchedMerchantId_idx" ON "MerchantLead"("matchedMerchantId");

CREATE UNIQUE INDEX "MerchantMember_merchantId_email_key" ON "MerchantMember"("merchantId", "email");
CREATE INDEX "MerchantMember_email_idx" ON "MerchantMember"("email");
CREATE INDEX "MerchantMember_status_idx" ON "MerchantMember"("status");

CREATE UNIQUE INDEX "MerchantSubscription_merchantId_key" ON "MerchantSubscription"("merchantId");
CREATE INDEX "MerchantSubscription_status_idx" ON "MerchantSubscription"("status");
CREATE INDEX "MerchantSubscription_plan_idx" ON "MerchantSubscription"("plan");

CREATE UNIQUE INDEX "MerchantMagicLink_tokenHash_key" ON "MerchantMagicLink"("tokenHash");
CREATE INDEX "MerchantMagicLink_memberId_idx" ON "MerchantMagicLink"("memberId");
CREATE INDEX "MerchantMagicLink_expiresAt_idx" ON "MerchantMagicLink"("expiresAt");

CREATE UNIQUE INDEX "MerchantSession_tokenHash_key" ON "MerchantSession"("tokenHash");
CREATE INDEX "MerchantSession_memberId_idx" ON "MerchantSession"("memberId");
CREATE INDEX "MerchantSession_expiresAt_idx" ON "MerchantSession"("expiresAt");

CREATE INDEX "PremiumPlacement_merchantId_idx" ON "PremiumPlacement"("merchantId");
CREATE INDEX "PremiumPlacement_status_startsAt_endsAt_idx" ON "PremiumPlacement"("status", "startsAt", "endsAt");

ALTER TABLE "MerchantLead"
  ADD CONSTRAINT "MerchantLead_matchedMerchantId_fkey"
  FOREIGN KEY ("matchedMerchantId") REFERENCES "Merchant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MerchantMember"
  ADD CONSTRAINT "MerchantMember_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantSubscription"
  ADD CONSTRAINT "MerchantSubscription_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantMagicLink"
  ADD CONSTRAINT "MerchantMagicLink_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "MerchantMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantSession"
  ADD CONSTRAINT "MerchantSession_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "MerchantMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PremiumPlacement"
  ADD CONSTRAINT "PremiumPlacement_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
