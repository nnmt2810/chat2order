import { prisma } from "../lib/prisma.js";
import { handleBatch } from "./batch-handler.js";

// Tin lỗi quá số lần này thì bị bỏ qua (nằm lại trong cơ sở dữ liệu để xem sau)
export const MAX_PROCESS_ATTEMPTS = 10;
const MAX_ROUNDS = 5;
const MAX_BATCH_SIZE = 50;

export type BatchMessage = { id: string; text: string; createdAt: Date };

export type ConversationBatch = {
  shopId: string;
  conversationId: string;
  messages: BatchMessage[];
};

export async function processConversation(
  shopId: string,
  conversationId: string,
): Promise<{ rounds: number; messages: number }> {
  let rounds = 0;
  let total = 0;

  while (rounds < MAX_ROUNDS) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        direction: "INBOUND",
        processedAt: null,
        processAttempts: { lt: MAX_PROCESS_ATTEMPTS },
        conversation: { shopId },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_BATCH_SIZE,
      select: { id: true, text: true, createdAt: true },
    });
    if (messages.length === 0) break;

    const ids = messages.map((message) => message.id);

    try {
      await handleBatch({ shopId, conversationId, messages });
    } catch (err) {
      await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { processAttempts: { increment: 1 } },
      });
      throw err;
    }

    // Chỉ đánh dấu đúng các tin vừa xử lý: tin đến sau khi lấy danh sách vẫn còn chờ
    await prisma.message.updateMany({
      where: { id: { in: ids }, processedAt: null },
      data: { processedAt: new Date() },
    });

    rounds += 1;
    total += messages.length;
  }

  return { rounds, messages: total };
}

// Hội thoại còn tin chưa xử lý quá lâu: công việc có thể đã mất hoặc thất bại hết lượt thử
export async function findStaleConversations(
  olderThan: Date,
  limit = 100,
): Promise<{ shopId: string; conversationId: string }[]> {
  const rows = await prisma.conversation.findMany({
    where: {
      messages: {
        some: {
          direction: "INBOUND",
          processedAt: null,
          processAttempts: { lt: MAX_PROCESS_ATTEMPTS },
          createdAt: { lt: olderThan },
        },
      },
    },
    select: { id: true, shopId: true },
    take: limit,
  });
  return rows.map((row) => ({ shopId: row.shopId, conversationId: row.id }));
}
