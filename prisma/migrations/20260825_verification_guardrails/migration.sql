CREATE TYPE "ReviewFlagType" AS ENUM (
  'ROLE_CHANGED',
  'CANONICAL_URL_CHANGED',
  'FETCH_UNSTABLE',
  'CONTENT_CHANGED'
);

CREATE TYPE "ReviewFlagStatus" AS ENUM (
  'OPEN',
  'RESOLVED',
  'DISMISSED'
);

CREATE TABLE "VerificationFetchObservation" (
  "id" TEXT NOT NULL,
  "discoveryItemId" TEXT NOT NULL,
  "preflightKind" TEXT NOT NULL,
  "contentHash" TEXT,
  "httpStatus" INTEGER,
  "fetchTier" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationFetchObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionReviewFlag" (
  "id" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "type" "ReviewFlagType" NOT NULL,
  "status" "ReviewFlagStatus" NOT NULL DEFAULT 'OPEN',
  "oldValue" TEXT,
  "newValue" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ProductionReviewFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationFetchObservation_discoveryItemId_observedAt_idx"
ON "VerificationFetchObservation"("discoveryItemId", "observedAt");

CREATE INDEX "VerificationFetchObservation_preflightKind_idx"
ON "VerificationFetchObservation"("preflightKind");

CREATE INDEX "ProductionReviewFlag_giftCardId_status_idx"
ON "ProductionReviewFlag"("giftCardId", "status");

CREATE INDEX "ProductionReviewFlag_type_status_idx"
ON "ProductionReviewFlag"("type", "status");

ALTER TABLE "VerificationFetchObservation"
ADD CONSTRAINT "VerificationFetchObservation_discoveryItemId_fkey"
FOREIGN KEY ("discoveryItemId") REFERENCES "DiscoveryItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionReviewFlag"
ADD CONSTRAINT "ProductionReviewFlag_giftCardId_fkey"
FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
