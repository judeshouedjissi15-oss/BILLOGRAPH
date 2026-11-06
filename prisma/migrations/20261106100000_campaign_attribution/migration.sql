ALTER TABLE "Order"
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmContent" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "landingReferrer" TEXT;

CREATE INDEX "Order_storeId_utmSource_idx" ON "Order"("storeId", "utmSource");
CREATE INDEX "Order_storeId_utmCampaign_idx" ON "Order"("storeId", "utmCampaign");
