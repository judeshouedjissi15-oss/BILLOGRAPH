-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "granted" TEXT NOT NULL DEFAULT '[]',
    "revoked" TEXT NOT NULL DEFAULT '[]',
    "updatedByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_userId_key" ON "StaffPermission"("userId");

