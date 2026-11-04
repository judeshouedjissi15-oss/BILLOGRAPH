CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateLinkId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 1,
    "lastClickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateClick_affiliateLinkId_visitorHash_dayKey_key"
ON "AffiliateClick"("affiliateLinkId", "visitorHash", "dayKey");
CREATE INDEX "AffiliateClick_affiliateLinkId_dayKey_idx"
ON "AffiliateClick"("affiliateLinkId", "dayKey");

ALTER TABLE "AffiliateClick"
ADD CONSTRAINT "AffiliateClick_affiliateLinkId_fkey"
FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
