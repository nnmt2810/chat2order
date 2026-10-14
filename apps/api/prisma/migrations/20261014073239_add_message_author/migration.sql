-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "lastMessageDirection" "MessageDirection" NOT NULL DEFAULT 'INBOUND';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "authorId" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
