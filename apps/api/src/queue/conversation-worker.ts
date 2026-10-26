import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  findStaleConversations,
  processConversation,
} from "../services/conversation-processing.js";
import { redisConnection } from "./connection.js";
import {
  QUEUE_NAME,
  enqueueConversationProcessing,
  type ProcessConversationData,
} from "./conversation-queue.js";

const SWEEP_INTERVAL_MS = 30_000;
// Tin chưa xử lý quá thời gian gom cộng thêm khoảng đệm này thì công việc của nó coi như đã mất
const SWEEP_GRACE_MS = 15_000;

let worker: Worker<ProcessConversationData> | null = null;
let sweepTimer: NodeJS.Timeout | null = null;

async function sweep(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - env.BATCH_QUIET_MS - SWEEP_GRACE_MS);
    const stale = await findStaleConversations(cutoff);
    for (const { shopId, conversationId } of stale) {
      enqueueConversationProcessing(shopId, conversationId);
    }
    if (stale.length > 0) {
      logger.info({ count: stale.length }, "Re-queued conversations with unprocessed messages");
    }
  } catch (err) {
    logger.warn({ err }, "Conversation sweep failed");
  }
}

export function startConversationWorker(): Worker<ProcessConversationData> {
  if (worker) return worker;

  const created = new Worker<ProcessConversationData>(
    QUEUE_NAME,
    async (job) => {
      const { shopId, conversationId } = job.data;
      const result = await processConversation(shopId, conversationId);
      logger.info({ jobId: job.id, conversationId, ...result }, "Conversation batch processed");
      return result;
    },
    {
      connection: redisConnection(),
      // Chỉ một công việc một lúc: bảo đảm không bao giờ có hai lượt xử lý cùng một hội thoại.
      // Chỉ tăng lên khi đã có khóa theo hội thoại.
      concurrency: 1,
    },
  );
  created.on("error", (err) => logger.error({ err }, "Conversation worker error"));
  created.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      "Conversation job failed",
    );
  });
  worker = created;

  // Bù lại ngay khi khởi động (công việc có thể đã mất lúc tiến trình tắt), rồi quét định kỳ
  void sweep();
  sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  sweepTimer.unref();

  logger.info("Conversation worker started");
  return created;
}

export async function closeConversationWorker(): Promise<void> {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  if (!worker) return;
  const current = worker;
  worker = null;
  // Chờ công việc đang chạy làm xong
  await current.close();
}
