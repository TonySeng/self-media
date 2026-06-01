-- CreateTable
CREATE TABLE "WorkComment" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatar" TEXT,
    "authorUid" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkComment_workId_publishedAt_idx" ON "WorkComment"("workId", "publishedAt");

-- CreateIndex
CREATE INDEX "WorkComment_workId_likeCount_idx" ON "WorkComment"("workId", "likeCount");

-- CreateIndex
CREATE UNIQUE INDEX "WorkComment_workId_platformCommentId_key" ON "WorkComment"("workId", "platformCommentId");

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
