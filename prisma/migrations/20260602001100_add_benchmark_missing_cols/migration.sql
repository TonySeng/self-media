-- AlterTable: add missing columns to BenchmarkAccount
ALTER TABLE "BenchmarkAccount" ADD COLUMN "avatar" TEXT;
ALTER TABLE "BenchmarkAccount" ADD COLUMN "secUid" TEXT;
ALTER TABLE "BenchmarkAccount" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "BenchmarkAccount" ADD COLUMN "lastError" TEXT;

-- AlterTable: add missing columns to BenchmarkWork
ALTER TABLE "BenchmarkWork" ADD COLUMN "platformWorkId" TEXT;
ALTER TABLE "BenchmarkWork" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "BenchmarkWork" ADD COLUMN "duration" INTEGER;
ALTER TABLE "BenchmarkWork" ADD COLUMN "rawData" JSONB;
ALTER TABLE "BenchmarkWork" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateIndex (unique constraints from schema)
CREATE UNIQUE INDEX IF NOT EXISTS "BenchmarkAccount_platform_secUid_key" ON "BenchmarkAccount"("platform", "secUid");
CREATE UNIQUE INDEX IF NOT EXISTS "BenchmarkWork_benchmarkAccountId_platformWorkId_key" ON "BenchmarkWork"("benchmarkAccountId", "platformWorkId");
CREATE INDEX IF NOT EXISTS "BenchmarkWork_benchmarkAccountId_play_idx" ON "BenchmarkWork"("benchmarkAccountId", "play");
