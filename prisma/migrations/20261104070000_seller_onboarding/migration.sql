CREATE TABLE "SellerOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responses" TEXT NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerOnboarding_userId_key" ON "SellerOnboarding"("userId");
CREATE INDEX "SellerOnboarding_updatedAt_idx" ON "SellerOnboarding"("updatedAt");

ALTER TABLE "SellerOnboarding"
ADD CONSTRAINT "SellerOnboarding_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
