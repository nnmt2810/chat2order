import { prisma } from "../lib/prisma.js";
import { handleBatch } from "./batch-handler.js";
import { LlmError } from "../llm/errors.js";

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
      // Lỗi tạm thời của AI (quá tải, hết thời gian) không phải lỗi của tin nhắn -> không tăng processAttempts, để thử lại sau
      const transient = err instanceof LlmError && err.retryable;
      if (!transient) {
        await prisma.message.updateMany({
          where: { id: { in: ids } },
          data: { processAttempts: { increment: 1 } },
        });
      }
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

// Chỉ xét tin trong vòng 24 giờ: tin cũ hơn mà vẫn chưa xử lý được thì thôi, không thử lại mãi
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Hội thoại còn tin chưa xử lý quá lâu: công việc có thể đã mất hoặc thất bại hết lượt thử
export async function findStaleConversations(
  olderThan: Date,
  options: { newerThan?: Date; limit?: number } = {},
): Promise<{ shopId: string; conversationId: string }[]> {
  const newerThan = options.newerThan ?? new Date(Date.now() - STALE_WINDOW_MS);

  const rows = await prisma.conversation.findMany({
    where: {
      messages: {
        some: {
          direction: "INBOUND",
          processedAt: null,
          processAttempts: { lt: MAX_PROCESS_ATTEMPTS },
          createdAt: { lt: olderThan, gt: newerThan },
        },
      },
    },
    select: { id: true, shopId: true },
    take: options.limit ?? 100,
  });
  return rows.map((row) => ({ shopId: row.shopId, conversationId: row.id }));
}
