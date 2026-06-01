-- CreateEnum
CREATE TYPE "AIAnalysisType" AS ENUM ('WORK_REVIEW', 'TOPIC_SUGGEST', 'COPY_OPTIMIZE', 'WORKS_COMPARE', 'TREND', 'COMMENT_INSIGHT', 'BENCHMARK');

-- CreateEnum
CREATE TYPE "AIAnalysisStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AIChatRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "LLMProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "type" "AIAnalysisType" NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "isCustomized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "type" "AIAnalysisType" NOT NULL,
    "targetRefs" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "modelUsed" TEXT NOT NULL,
    "llmProviderId" TEXT NOT NULL,
    "tokensUsed" JSONB,
    "status" "AIAnalysisStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "AIChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "tokensUsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LLMProvider_enabled_createdAt_idx" ON "LLMProvider"("enabled", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_type_key" ON "PromptTemplate"("type");

-- CreateIndex
CREATE INDEX "PromptTemplate_type_idx" ON "PromptTemplate"("type");

-- CreateIndex
CREATE INDEX "AIAnalysis_type_createdAt_idx" ON "AIAnalysis"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_status_createdAt_idx" ON "AIAnalysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIChat_updatedAt_idx" ON "AIChat"("updatedAt");

-- CreateIndex
CREATE INDEX "AIChatMessage_chatId_createdAt_idx" ON "AIChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_llmProviderId_fkey" FOREIGN KEY ("llmProviderId") REFERENCES "LLMProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatMessage" ADD CONSTRAINT "AIChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AIChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
