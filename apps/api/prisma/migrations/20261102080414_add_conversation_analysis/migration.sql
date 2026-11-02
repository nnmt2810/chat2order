-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "lastIntents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "needsAttention" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "conversation_analyses" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lastMessageId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "intents" JSONB NOT NULL,
    "needsHuman" BOOLEAN NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorCode" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_analyses_lastMessageId_key" ON "conversation_analyses"("lastMessageId");

-- CreateIndex
CREATE INDEX "conversation_analyses_conversationId_createdAt_idx" ON "conversation_analyses"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_shopId_needsAttention_idx" ON "conversations"("shopId", "needsAttention");

-- AddForeignKey
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
