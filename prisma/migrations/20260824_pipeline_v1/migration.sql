CREATE TYPE "VerificationMethod" AS ENUM ('HTTP', 'PLAYWRIGHT', 'LLM', 'MANUAL');
CREATE TYPE "VerificationAttemptResult" AS ENUM ('PASSED', 'FAILED', 'AMBIGUOUS', 'BLOCKED', 'ERROR');
CREATE TYPE "VerificationPageRole" AS ENUM ('CANONICAL_PURCHASE', 'CHECKOUT', 'TERMS', 'PROMOTION', 'CONTENT', 'GIFT_GUIDE', 'GAMING_VOUCHER', 'GENERIC', 'UNKNOWN');

CREATE TABLE "ManualCanonicalOverride" (
    "id" TEXT NOT NULL,
    "merchantDomain" TEXT NOT NULL,
    "forcedUrl" TEXT NOT NULL,
    "forcedMerchantName" TEXT,
    "reason" TEXT NOT NULL,
    "setBy" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManualCanonicalOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualCanonicalOverride_merchantDomain_key" ON "ManualCanonicalOverride"("merchantDomain");
CREATE INDEX "ManualCanonicalOverride_active_idx" ON "ManualCanonicalOverride"("active");
CREATE INDEX "ManualCanonicalOverride_merchantDomain_idx" ON "ManualCanonicalOverride"("merchantDomain");

CREATE TABLE "ScoringModelVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScoringModelVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoringModelVersion_key_key" ON "ScoringModelVersion"("key");
CREATE INDEX "ScoringModelVersion_active_idx" ON "ScoringModelVersion"("active");

CREATE TABLE "CanonicalizationRun" (
    "id" TEXT NOT NULL,
    "scoringModelKey" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "domainsProcessed" INTEGER NOT NULL DEFAULT 0,
    "winnersSelected" INTEGER NOT NULL DEFAULT 0,
    "overridesApplied" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "CanonicalizationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanonicalizationRun_scoringModelKey_idx" ON "CanonicalizationRun"("scoringModelKey");
CREATE INDEX "CanonicalizationRun_startedAt_idx" ON "CanonicalizationRun"("startedAt");

CREATE TABLE "CanonicalizationDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "merchantDomain" TEXT NOT NULL,
    "candidateUrl" TEXT NOT NULL,
    "candidateKind" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "overrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "reasonCodes" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanonicalizationDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanonicalizationDecision_runId_idx" ON "CanonicalizationDecision"("runId");
CREATE INDEX "CanonicalizationDecision_merchantDomain_idx" ON "CanonicalizationDecision"("merchantDomain");
CREATE INDEX "CanonicalizationDecision_selected_idx" ON "CanonicalizationDecision"("selected");
CREATE INDEX "CanonicalizationDecision_overrideApplied_idx" ON "CanonicalizationDecision"("overrideApplied");

ALTER TABLE "CanonicalizationDecision"
ADD CONSTRAINT "CanonicalizationDecision_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "CanonicalizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DiscoveryVerificationAttempt" (
    "id" TEXT NOT NULL,
    "discoveryItemId" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "result" "VerificationAttemptResult" NOT NULL,
    "pageRole" "VerificationPageRole" NOT NULL DEFAULT 'UNKNOWN',
    "requestedUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "httpStatus" INTEGER,
    "confidence" DOUBLE PRECISION,
    "modelName" TEXT,
    "contentHash" TEXT,
    "reasonCodes" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveryVerificationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscoveryVerificationAttempt_discoveryItemId_idx" ON "DiscoveryVerificationAttempt"("discoveryItemId");
CREATE INDEX "DiscoveryVerificationAttempt_method_idx" ON "DiscoveryVerificationAttempt"("method");
CREATE INDEX "DiscoveryVerificationAttempt_result_idx" ON "DiscoveryVerificationAttempt"("result");
CREATE INDEX "DiscoveryVerificationAttempt_pageRole_idx" ON "DiscoveryVerificationAttempt"("pageRole");
CREATE INDEX "DiscoveryVerificationAttempt_checkedAt_idx" ON "DiscoveryVerificationAttempt"("checkedAt");

ALTER TABLE "DiscoveryVerificationAttempt"
ADD CONSTRAINT "DiscoveryVerificationAttempt_discoveryItemId_fkey"
FOREIGN KEY ("discoveryItemId") REFERENCES "DiscoveryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
