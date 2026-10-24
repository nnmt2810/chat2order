import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { attachRealtime, closeRealtime } from "./realtime.js";

const app = createApp();
const server = createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  // Phòng khi kết nối giữ máy chủ không chịu đóng
  setTimeout(() => process.exit(1), 5000).unref();
  void closeRealtime().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
