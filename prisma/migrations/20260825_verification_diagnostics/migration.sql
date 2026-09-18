ALTER TABLE "DiscoveryVerificationAttempt"
ADD COLUMN "promptVersion" TEXT,
ADD COLUMN "temperature" DOUBLE PRECISION;

CREATE INDEX "DiscoveryVerificationAttempt_promptVersion_idx"
ON "DiscoveryVerificationAttempt"("promptVersion");
