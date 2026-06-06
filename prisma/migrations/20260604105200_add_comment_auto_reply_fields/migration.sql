-- CreateEnum
CREATE TYPE "AutoReplyStatus" AS ENUM ('REPLIED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "WorkComment" ADD COLUMN     "autoReplyStatus" "AutoReplyStatus",
ADD COLUMN     "autoReplyContent" TEXT,
ADD COLUMN     "autoReplyAt" TIMESTAMP(3),
ADD COLUMN     "autoReplyError" TEXT;

-- CreateIndex
CREATE INDEX "WorkComment_workId_autoReplyStatus_idx" ON "WorkComment"("workId", "autoReplyStatus");
