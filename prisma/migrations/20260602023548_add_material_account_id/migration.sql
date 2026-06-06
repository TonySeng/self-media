-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "platformAccountId" TEXT;

-- CreateTable
CREATE TABLE "Publish" (
    "id" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverKey" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "screenshotKey" TEXT,
    "publishedWorkId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publish_platformAccountId_createdAt_idx" ON "Publish"("platformAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "Publish_status_createdAt_idx" ON "Publish"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Material_platformAccountId_type_createdAt_idx" ON "Material"("platformAccountId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "PlatformAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publish" ADD CONSTRAINT "Publish_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "PlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publish" ADD CONSTRAINT "Publish_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
