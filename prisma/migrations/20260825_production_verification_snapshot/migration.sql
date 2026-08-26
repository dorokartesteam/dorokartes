CREATE TABLE "ProductionVerificationSnapshot" (
  "id" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "officialUrl" TEXT NOT NULL,
  "contentHash" TEXT,
  "pageRole" "VerificationPageRole",
  "httpStatus" INTEGER,
  "fetchTier" TEXT,
  "preflightKind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionVerificationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionVerificationSnapshot_giftCardId_observedAt_idx"
ON "ProductionVerificationSnapshot"("giftCardId", "observedAt");

CREATE INDEX "ProductionVerificationSnapshot_officialUrl_idx"
ON "ProductionVerificationSnapshot"("officialUrl");

ALTER TABLE "ProductionVerificationSnapshot"
ADD CONSTRAINT "ProductionVerificationSnapshot_giftCardId_fkey"
FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
