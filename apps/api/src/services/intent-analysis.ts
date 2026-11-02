import type { IntentResult, RoutingReason } from "@chat2order/shared/conversation";
import { classifyIntents, type PromptMessage } from "../ai/intent.js";
import { LlmError } from "../llm/errors.js";
import type { LlmGateway } from "../llm/types.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { emitConversationChanged } from "../realtime.js";
import type { ConversationBatch } from "./conversation-processing.js";

const HISTORY_SIZE = 6;

type AnalysisRecord = {
  status: "COMPLETED" | "FAILED";
  intents: IntentResult[];
  needsHuman: boolean;
  reasons: RoutingReason[];
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
};

// Vài tin gần nhất trước lượt này, làm ngữ cảnh cho những câu như "ok em", "như cũ"
async function loadHistory(
  shopId: string,
  conversationId: string,
  before: Date,
): Promise<PromptMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, createdAt: { lt: before }, conversation: { shopId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_SIZE,
    select: { direction: true, text: true },
  });
  return rows.reverse();
}

// Khóa duy nhất theo tin cuối của lượt: chạy lại cùng một lượt thì cập nhật chính bản ghi đó, không sinh trùng
async function saveAnalysis(
  batch: ConversationBatch,
  lastMessageId: string,
  model: string,
  record: AnalysisRecord,
): Promise<void> {
  const data = {
    conversationId: batch.conversationId,
    messageCount: batch.messages.length,
    model,
    ...record,
  };

  await prisma.$transaction(async (tx) => {
    await tx.conversationAnalysis.upsert({
      where: { lastMessageId },
      create: { ...data, lastMessageId },
      update: data,
    });
    await tx.conversation.updateMany({
      where: { id: batch.conversationId, shopId: batch.shopId },
      data: {
        lastIntents: record.intents.map((intent) => intent.type),
        // Chỉ bật, không tự tắt
        ...(record.needsHuman ? { needsAttention: true } : {}),
      },
    });
  });

  emitConversationChanged(batch.shopId, batch.conversationId);
}

export async function analyzeBatch(batch: ConversationBatch, gateway: LlmGateway): Promise<void> {
  const first = batch.messages[0];
  const last = batch.messages[batch.messages.length - 1];
  if (!first || !last) return;

  const history = await loadHistory(batch.shopId, batch.conversationId, first.createdAt);

  try {
    const outcome = await classifyIntents(gateway, {
      history,
      messages: batch.messages.map((message) => message.text),
    });

    await saveAnalysis(batch, last.id, gateway.model, {
      status: "COMPLETED",
      intents: outcome.classification.intents,
      needsHuman: outcome.routing.needsHuman,
      reasons: outcome.routing.reasons,
      errorCode: null,
      inputTokens: outcome.usage.inputTokens ?? null,
      outputTokens: outcome.usage.outputTokens ?? null,
      latencyMs: outcome.latencyMs,
    });
  } catch (err) {
    // Lỗi không thể thử lại (sai khóa, đầu ra sai cấu trúc) -> ghi nhận, đừng thử lại vô ích.
    // Lỗi tạm thời và lỗi bất ngờ thì ném lên để hàng đợi thử lại.
    if (err instanceof LlmError && !err.retryable) {
      logger.error(
        { conversationId: batch.conversationId, code: err.code, status: err.status },
        "Intent classification failed permanently, flagged for a person to review",
      );
      await saveAnalysis(batch, last.id, gateway.model, {
        status: "FAILED",
        intents: [],
        needsHuman: true,
        reasons: ["AI_FAILED"],
        errorCode: err.code,
        inputTokens: null,
        outputTokens: null,
        latencyMs: null,
      });
      return;
    }
    throw err;
  }
}
