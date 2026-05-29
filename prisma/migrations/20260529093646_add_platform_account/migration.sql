-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('DOUYIN');

-- CreateEnum
CREATE TYPE "CookieStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'INVALID');

-- CreateTable
CREATE TABLE "PlatformAccount" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "secUid" TEXT NOT NULL,
    "cookieEncrypted" TEXT NOT NULL,
    "cookieStatus" "CookieStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccount_secUid_key" ON "PlatformAccount"("secUid");

-- CreateIndex
CREATE INDEX "PlatformAccount_platform_cookieStatus_idx" ON "PlatformAccount"("platform", "cookieStatus");
