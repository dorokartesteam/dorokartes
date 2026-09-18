
ALTER TABLE "DiscoveryVerificationAttempt"
ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "totalTokens" INTEGER,
ADD COLUMN "cacheHit" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "RediscoveryTaskStatus" AS ENUM ('PENDING','RUNNING','RESOLVED','MANUAL_REVIEW','FAILED');

CREATE TABLE "ManualVerificationOverride" (
  "id" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "forcedStatus" "DiscoveryStatus" NOT NULL,
  "forcedPageRole" "VerificationPageRole" NOT NULL,
  "forcedMerchantName" TEXT,
  "reason" TEXT NOT NULL,
  "setBy" TEXT NOT NULL,
  "contentHash" TEXT,
  "lockUntilContentChanges" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualVerificationOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualVerificationOverride_sourceUrl_key" ON "ManualVerificationOverride"("sourceUrl");
CREATE INDEX "ManualVerificationOverride_active_idx" ON "ManualVerificationOverride"("active");
CREATE INDEX "ManualVerificationOverride_forcedStatus_idx" ON "ManualVerificationOverride"("forcedStatus");

CREATE TABLE "DomainRediscoveryTask" (
  "id" TEXT NOT NULL,
  "merchantDomain" TEXT NOT NULL,
  "merchantName" TEXT,
  "triggerUrl" TEXT NOT NULL,
  "triggerReason" TEXT NOT NULL,
  "status" "RediscoveryTaskStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "resolvedUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainRediscoveryTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DomainRediscoveryTask_merchantDomain_idx" ON "DomainRediscoveryTask"("merchantDomain");
CREATE INDEX "DomainRediscoveryTask_status_idx" ON "DomainRediscoveryTask"("status");
CREATE INDEX "DomainRediscoveryTask_createdAt_idx" ON "DomainRediscoveryTask"("createdAt");
