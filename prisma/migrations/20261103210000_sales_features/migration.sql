ALTER TABLE "Store"
  ADD COLUMN "faqs" TEXT,
  ADD COLUMN "deliveryInfo" TEXT,
  ADD COLUMN "returnPolicy" TEXT,
  ADD COLUMN "trustMessage" TEXT;

ALTER TABLE "Product"
  ADD COLUMN "salePriceXOF" INTEGER,
  ADD COLUMN "saleStartsAt" TIMESTAMP(3),
  ADD COLUMN "saleEndsAt" TIMESTAMP(3),
  ADD COLUMN "purchaseLabel" TEXT NOT NULL DEFAULT 'Acheter maintenant',
  ADD COLUMN "affiliateEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "affiliatePercent" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Order"
  ADD COLUMN "affiliateCommissionXOF" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountXOF" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "affiliateLinkId" TEXT,
  ADD COLUMN "promoCodeId" TEXT;

CREATE TABLE "ProductFile" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" BIGINT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductUpload" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileSize" BIGINT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFileDownload" (
  "id" TEXT NOT NULL,
  "downloadTokenId" TEXT NOT NULL,
  "productFileId" TEXT NOT NULL,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFileDownload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateLink" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoCode" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductUpload_key_key" ON "ProductUpload"("key");
CREATE UNIQUE INDEX "ProductFile_fileKey_key" ON "ProductFile"("fileKey");
CREATE INDEX "ProductUpload_ownerId_expiresAt_idx" ON "ProductUpload"("ownerId", "expiresAt");
CREATE INDEX "ProductFile_productId_position_idx" ON "ProductFile"("productId", "position");
CREATE UNIQUE INDEX "ProductFileDownload_downloadTokenId_productFileId_key"
  ON "ProductFileDownload"("downloadTokenId", "productFileId");
CREATE INDEX "ProductFileDownload_productFileId_idx" ON "ProductFileDownload"("productFileId");
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");
CREATE UNIQUE INDEX "AffiliateLink_userId_productId_key" ON "AffiliateLink"("userId", "productId");
CREATE INDEX "AffiliateLink_productId_idx" ON "AffiliateLink"("productId");
CREATE UNIQUE INDEX "PromoCode_productId_code_key" ON "PromoCode"("productId", "code");
CREATE INDEX "PromoCode_productId_active_idx" ON "PromoCode"("productId", "active");

ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFileDownload" ADD CONSTRAINT "ProductFileDownload_downloadTokenId_fkey"
  FOREIGN KEY ("downloadTokenId") REFERENCES "DownloadToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFileDownload" ADD CONSTRAINT "ProductFileDownload_productFileId_fkey"
  FOREIGN KEY ("productFileId") REFERENCES "ProductFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductUpload" ADD CONSTRAINT "ProductUpload_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_affiliateLinkId_fkey"
  FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
