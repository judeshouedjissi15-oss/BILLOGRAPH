ALTER TABLE "Order"
ADD COLUMN "affiliateRatePercent" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AffiliatePayoutProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'BJ',
    "operator" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliatePayoutProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "affiliateLinkId" TEXT NOT NULL,
    "affiliateUserId" TEXT NOT NULL,
    "amountXOF" INTEGER NOT NULL,
    "ratePercent" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAmountXOF" INTEGER NOT NULL DEFAULT 0,
    "validatedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountXOF" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'BJ',
    "operator" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "payoutStatus" TEXT,
    "providerRef" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AffiliateWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCommissionAllocation" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "amountXOF" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateCommissionAllocation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AffiliateCommission" (
    "id",
    "orderId",
    "affiliateLinkId",
    "affiliateUserId",
    "amountXOF",
    "ratePercent",
    "status",
    "paidAmountXOF",
    "validatedAt",
    "availableAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-' || md5(o."id"),
    o."id",
    link."id",
    link."userId",
    o."affiliateCommissionXOF",
    0,
    CASE
        WHEN o."status" IN ('PAID', 'DELIVERED') THEN 'AVAILABLE'
        WHEN o."status" = 'PENDING' THEN 'PENDING'
        ELSE 'CANCELLED'
    END,
    0,
    CASE WHEN o."status" IN ('PAID', 'DELIVERED') THEN o."paidAt" ELSE NULL END,
    CASE WHEN o."status" IN ('PAID', 'DELIVERED') THEN o."paidAt" ELSE NULL END,
    o."createdAt",
    CURRENT_TIMESTAMP
FROM "Order" o
JOIN "AffiliateLink" link ON link."id" = o."affiliateLinkId"
WHERE o."affiliateCommissionXOF" > 0;

CREATE UNIQUE INDEX "AffiliatePayoutProfile_userId_key" ON "AffiliatePayoutProfile"("userId");
CREATE UNIQUE INDEX "AffiliateCommission_orderId_key" ON "AffiliateCommission"("orderId");
CREATE INDEX "AffiliateCommission_affiliateUserId_status_createdAt_idx" ON "AffiliateCommission"("affiliateUserId", "status", "createdAt");
CREATE UNIQUE INDEX "AffiliateWithdrawal_payoutId_key" ON "AffiliateWithdrawal"("payoutId");
CREATE UNIQUE INDEX "AffiliateWithdrawal_providerRef_key" ON "AffiliateWithdrawal"("providerRef");
CREATE INDEX "AffiliateWithdrawal_userId_status_requestedAt_idx" ON "AffiliateWithdrawal"("userId", "status", "requestedAt");
CREATE INDEX "AffiliateWithdrawal_status_requestedAt_idx" ON "AffiliateWithdrawal"("status", "requestedAt");
CREATE INDEX "AffiliateCommissionAllocation_withdrawalId_idx" ON "AffiliateCommissionAllocation"("withdrawalId");
CREATE UNIQUE INDEX "AffiliateCommissionAllocation_commissionId_withdrawalId_key" ON "AffiliateCommissionAllocation"("commissionId", "withdrawalId");

ALTER TABLE "AffiliatePayoutProfile"
ADD CONSTRAINT "AffiliatePayoutProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission"
ADD CONSTRAINT "AffiliateCommission_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission"
ADD CONSTRAINT "AffiliateCommission_affiliateLinkId_fkey"
FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission"
ADD CONSTRAINT "AffiliateCommission_affiliateUserId_fkey"
FOREIGN KEY ("affiliateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateWithdrawal"
ADD CONSTRAINT "AffiliateWithdrawal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateWithdrawal"
ADD CONSTRAINT "AffiliateWithdrawal_processedBy_fkey"
FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommissionAllocation"
ADD CONSTRAINT "AffiliateCommissionAllocation_commissionId_fkey"
FOREIGN KEY ("commissionId") REFERENCES "AffiliateCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommissionAllocation"
ADD CONSTRAINT "AffiliateCommissionAllocation_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "AffiliateWithdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
