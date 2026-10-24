/*
  Warnings:

  - A unique constraint covering the columns `[conversationId,externalId]` on the table `messages` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[webChatKey]` on the table `shops` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "webChatKey" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_externalId_key" ON "messages"("conversationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "shops_webChatKey_key" ON "shops"("webChatKey");
