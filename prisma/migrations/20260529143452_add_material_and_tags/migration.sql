-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('COPY', 'TOPIC', 'VIDEO', 'IMAGE', 'AUDIO', 'IDEA', 'REFERENCE');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('DRAFT', 'ADOPTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileKey" TEXT,
    "fileSize" INTEGER,
    "fileMime" TEXT,
    "url" TEXT,
    "ideaStatus" "IdeaStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MaterialToMaterialTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MaterialToMaterialTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MaterialToWork" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MaterialToWork_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Material_type_createdAt_idx" ON "Material"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Material_type_ideaStatus_idx" ON "Material"("type", "ideaStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialTag_name_key" ON "MaterialTag"("name");

-- CreateIndex
CREATE INDEX "_MaterialToMaterialTag_B_index" ON "_MaterialToMaterialTag"("B");

-- CreateIndex
CREATE INDEX "_MaterialToWork_B_index" ON "_MaterialToWork"("B");

-- AddForeignKey
ALTER TABLE "_MaterialToMaterialTag" ADD CONSTRAINT "_MaterialToMaterialTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialToMaterialTag" ADD CONSTRAINT "_MaterialToMaterialTag_B_fkey" FOREIGN KEY ("B") REFERENCES "MaterialTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialToWork" ADD CONSTRAINT "_MaterialToWork_A_fkey" FOREIGN KEY ("A") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialToWork" ADD CONSTRAINT "_MaterialToWork_B_fkey" FOREIGN KEY ("B") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
