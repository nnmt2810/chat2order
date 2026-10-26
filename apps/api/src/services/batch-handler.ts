import { logger } from "../lib/logger.js";
import type { ConversationBatch } from "./conversation-processing.js";

// Sẽ thay thân hàm này bằng: phân loại ý định, trích xuất đơn, trả lời FAQ.
// Hàm phải chịu được việc chạy lại trên cùng một lượt (hàng đợi đảm bảo "ít nhất một lần").
// Log chỉ ghi id và số lượng, không ghi nội dung tin nhắn.
export async function handleBatch(batch: ConversationBatch): Promise<void> {
  logger.info(
    {
      shopId: batch.shopId,
      conversationId: batch.conversationId,
      messageCount: batch.messages.length,
      messageIds: batch.messages.map((message) => message.id),
    },
    "Batch ready for processing",
  );
}
