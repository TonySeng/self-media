-- CreateTable
CREATE TABLE "BenchmarkAccount" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "nickname" TEXT NOT NULL,
    "url" TEXT,
    "niche" TEXT,
    "followers" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkWork" (
    "id" TEXT NOT NULL,
    "benchmarkAccountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "play" INTEGER,
    "like" INTEGER,
    "comment" INTEGER,
    "share" INTEGER,
    "collect" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenchmarkAccount_platform_createdAt_idx" ON "BenchmarkAccount"("platform", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkWork_benchmarkAccountId_createdAt_idx" ON "BenchmarkWork"("benchmarkAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "BenchmarkWork" ADD CONSTRAINT "BenchmarkWork_benchmarkAccountId_fkey" FOREIGN KEY ("benchmarkAccountId") REFERENCES "BenchmarkAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
