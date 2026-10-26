import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { closeConversationQueue, startConversationQueue } from "./queue/conversation-queue.js";
import { closeConversationWorker, startConversationWorker } from "./queue/conversation-worker.js";
import { attachRealtime, closeRealtime } from "./realtime.js";

const app = createApp();
const server = createServer(app);
attachRealtime(server);

startConversationQueue();
// Worker chạy cùng tiến trình với API để dùng chung Socket.IO.
if (env.WORKER_ENABLED) {
  startConversationWorker();
}

server.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  // Phòng khi có kết nối hoặc công việc không chịu đóng
  setTimeout(() => process.exit(1), 10_000).unref();
  void (async () => {
    await closeConversationWorker();
    await closeConversationQueue();
    await closeRealtime();
  })().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
