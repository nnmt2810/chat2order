import { Queue, type JobsOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { redisConnection } from "./connection.js";

export const QUEUE_NAME = "conversation-processing";
export const PROCESS_CONVERSATION_JOB = "process-conversation";

export type ProcessConversationData = { shopId: string; conversationId: string };

// Chế độ debounce: mỗi tin mới của cùng hội thoại gia hạn thời gian chờ và thay thế công việc đang chờ,
// nên một loạt tin dồn dập chỉ còn đúng một công việc
export function conversationJobOptions(conversationId: string, quietMs: number): JobsOptions {
  return {
    delay: quietMs,
    deduplication: { id: `conv-${conversationId}`, ttl: quietMs, extend: true, replace: true },
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

let queue: Queue<ProcessConversationData> | null = null;

export function startConversationQueue(): Queue<ProcessConversationData> {
  if (queue) return queue;

  const created = new Queue<ProcessConversationData>(QUEUE_NAME, {
    connection: redisConnection(),
  });
  // Không có bộ lắng nghe này, một lỗi kết nối Redis sẽ làm sập cả tiến trình
  created.on("error", (err) => logger.error({ err }, "Conversation queue error"));
  queue = created;
  return created;
}

// Không chờ kết quả
// Công việc mất sẽ được bộ quét định kỳ của worker bù lại.
export function enqueueConversationProcessing(shopId: string, conversationId: string): void {
  if (!queue) return;

  queue
    .add(
      PROCESS_CONVERSATION_JOB,
      { shopId, conversationId },
      conversationJobOptions(conversationId, env.BATCH_QUIET_MS),
    )
    .catch((err: unknown) => {
      logger.warn({ err, conversationId }, "Failed to enqueue conversation processing");
    });
}

export async function closeConversationQueue(): Promise<void> {
  if (!queue) return;
  const current = queue;
  queue = null;
  await current.close();
}
