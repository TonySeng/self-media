-- AlterTable
ALTER TABLE "WorkComment" ADD COLUMN     "isAuthorReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentCommentId" TEXT;

-- CreateIndex
CREATE INDEX "WorkComment_workId_isAuthorReply_idx" ON "WorkComment"("workId", "isAuthorReply");
