-- CreateIndex
CREATE INDEX "messages_conversationId_processedAt_idx" ON "messages"("conversationId", "processedAt");
UPDATE "messages" SET "processedAt" = "createdAt";