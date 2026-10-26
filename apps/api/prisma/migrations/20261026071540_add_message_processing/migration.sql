-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "processAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processedAt" TIMESTAMP(3);
UPDATE "messages" SET "processedAt" = "createdAt";