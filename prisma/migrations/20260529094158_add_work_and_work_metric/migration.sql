-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "platformWorkId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "videoUrl" TEXT,
    "duration" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkMetric" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "play" INTEGER NOT NULL,
    "like" INTEGER NOT NULL,
    "comment" INTEGER NOT NULL,
    "share" INTEGER NOT NULL,
    "collect" INTEGER NOT NULL,
    "finishRate" DOUBLE PRECISION,
    "rawData" JSONB NOT NULL,

    CONSTRAINT "WorkMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Work_platformAccountId_publishedAt_idx" ON "Work"("platformAccountId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Work_platformAccountId_platformWorkId_key" ON "Work"("platformAccountId", "platformWorkId");

-- CreateIndex
CREATE INDEX "WorkMetric_workId_snapshotAt_idx" ON "WorkMetric"("workId", "snapshotAt");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "PlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkMetric" ADD CONSTRAINT "WorkMetric_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
