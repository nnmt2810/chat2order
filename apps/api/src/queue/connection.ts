import type { ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";

// Chuyển REDIS_URL thành thông số kết nối cho BullMQ
export function redisConnection(url: string = env.REDIS_URL): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(Number.isInteger(db) && db > 0 ? { db } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
