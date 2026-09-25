CREATE TABLE "CatalogViewEvent" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "giftCardId" TEXT,
    "sessionId" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogViewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogViewEvent_merchantId_viewedAt_idx" ON "CatalogViewEvent"("merchantId", "viewedAt");
CREATE INDEX "CatalogViewEvent_giftCardId_viewedAt_idx" ON "CatalogViewEvent"("giftCardId", "viewedAt");
CREATE INDEX "CatalogViewEvent_sessionId_viewedAt_idx" ON "CatalogViewEvent"("sessionId", "viewedAt");
CREATE INDEX "CatalogViewEvent_pageType_viewedAt_idx" ON "CatalogViewEvent"("pageType", "viewedAt");

ALTER TABLE "CatalogViewEvent"
ADD CONSTRAINT "CatalogViewEvent_merchantId_fkey"
FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogViewEvent"
ADD CONSTRAINT "CatalogViewEvent_giftCardId_fkey"
FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
