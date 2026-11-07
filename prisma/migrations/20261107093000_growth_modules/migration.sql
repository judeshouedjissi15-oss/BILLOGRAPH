ALTER TABLE "Order"
  ADD COLUMN "referralCreditUsedXOF" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "buyerReferralCodeId" TEXT;

ALTER TABLE "Store"
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" TEXT;

ALTER TABLE "Review"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "verifiedOrderId" TEXT;

CREATE TABLE "BuyerReferralCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCredit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amountXOF" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCreditRedemption" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountXOF" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCreditRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerReferralCode_userId_key" ON "BuyerReferralCode"("userId");
CREATE UNIQUE INDEX "BuyerReferralCode_code_key" ON "BuyerReferralCode"("code");
CREATE INDEX "BuyerReferralCode_code_idx" ON "BuyerReferralCode"("code");
CREATE UNIQUE INDEX "ReferralCredit_orderId_key" ON "ReferralCredit"("orderId");
CREATE UNIQUE INDEX "ReferralCredit_customerId_key" ON "ReferralCredit"("customerId");
CREATE INDEX "ReferralCredit_userId_createdAt_idx" ON "ReferralCredit"("userId", "createdAt");
CREATE UNIQUE INDEX "ReferralCreditRedemption_orderId_key" ON "ReferralCreditRedemption"("orderId");
CREATE INDEX "ReferralCreditRedemption_userId_createdAt_idx" ON "ReferralCreditRedemption"("userId", "createdAt");
CREATE UNIQUE INDEX "Review_verifiedOrderId_key" ON "Review"("verifiedOrderId");
CREATE INDEX "Review_productId_status_idx" ON "Review"("productId", "status");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_buyerReferralCodeId_fkey"
  FOREIGN KEY ("buyerReferralCodeId") REFERENCES "BuyerReferralCode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Review_verifiedOrderId_fkey"
  FOREIGN KEY ("verifiedOrderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerReferralCode"
  ADD CONSTRAINT "BuyerReferralCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCredit"
  ADD CONSTRAINT "ReferralCredit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralCredit_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralCredit_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCreditRedemption"
  ADD CONSTRAINT "ReferralCreditRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralCreditRedemption_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
