import { getLlmGateway } from "../llm/gateway.js";
import { logger } from "../lib/logger.js";
import type { ConversationBatch } from "./conversation-processing.js";
import { analyzeBatch } from "./intent-analysis.js";

// Điểm vào xử lý một lượt tin nhắn. Hàng đợi chạy "ít nhất một lần" nên mọi bước ở đây phải chạy lại được an toàn.
// Giai đoạn 8C sẽ nối thêm bước trích xuất đơn hàng sau bước phân loại.
export async function handleBatch(batch: ConversationBatch): Promise<void> {
  const gateway = getLlmGateway();
  if (!gateway) {
    logger.debug(
      { conversationId: batch.conversationId, messageCount: batch.messages.length },
      "AI is off, batch skipped",
    );
    return;
  }

  await analyzeBatch(batch, gateway);
}
