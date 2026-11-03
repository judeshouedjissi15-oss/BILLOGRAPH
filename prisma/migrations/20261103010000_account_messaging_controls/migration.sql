ALTER TABLE "User"
  ADD COLUMN "profileDiscoverable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "friendRequestsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "messagingSuspendedUntil" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);

ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Conversation"
  ADD COLUMN "hiddenAAt" TIMESTAMP(3),
  ADD COLUMN "hiddenBAt" TIMESTAMP(3);
ALTER TABLE "PlatformSettings"
  ADD COLUMN "messagingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "messageRetentionDays" INTEGER NOT NULL DEFAULT 365;

CREATE INDEX "User_messagingSuspendedUntil_idx" ON "User"("messagingSuspendedUntil");
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

CREATE TABLE "AccountActionToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetEmail" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "userNote" TEXT,
  "adminNote" TEXT,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "UserDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE UNIQUE INDEX "AccountActionToken_userId_action_key" ON "AccountActionToken"("userId", "action");
CREATE INDEX "UserDeletionRequest_status_createdAt_idx" ON "UserDeletionRequest"("status", "createdAt");
CREATE INDEX "UserDeletionRequest_userId_status_idx" ON "UserDeletionRequest"("userId", "status");

ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDeletionRequest" ADD CONSTRAINT "UserDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDeletionRequest" ADD CONSTRAINT "UserDeletionRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
