CREATE TYPE "DiscoveryScanStatus" AS ENUM (
  'PENDING',
  'SCANNED_NO_CANDIDATE',
  'CANDIDATES_FOUND',
  'BLOCKED',
  'ERROR'
);

CREATE TABLE "MerchantDiscoveryScan" (
  "id" TEXT NOT NULL,
  "merchantDomain" TEXT NOT NULL,
  "merchantName" TEXT NOT NULL,
  "websiteUrl" TEXT NOT NULL,
  "category" TEXT,
  "status" "DiscoveryScanStatus" NOT NULL DEFAULT 'PENDING',
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastScannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantDiscoveryScan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantDiscoveryScan_merchantDomain_key"
ON "MerchantDiscoveryScan"("merchantDomain");

CREATE INDEX "MerchantDiscoveryScan_status_lastScannedAt_idx"
ON "MerchantDiscoveryScan"("status", "lastScannedAt");
