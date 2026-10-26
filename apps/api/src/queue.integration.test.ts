import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "./queue/connection.js";
import { PROCESS_CONVERSATION_JOB, conversationJobOptions } from "./queue/conversation-queue.js";

const connection = redisConnection();
const host = "host" in connection && connection.host ? connection.host : "localhost";
const port = "port" in connection && connection.port ? connection.port : 6379;

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

const redisAvailable = await canConnect();
// CI đặt biến này để thiếu Redis là lỗi thật chứ không âm thầm bỏ qua bài kiểm tra
if (!redisAvailable && process.env.REQUIRE_REDIS_TESTS) {
  throw new Error("Redis is required for these tests but is not reachable");
}

const QUIET_MS = 300;

async function waitUntil(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!redisAvailable)("conversation queue with a real Redis", () => {
  const queueName = `test-conversation-${randomUUID()}`;
  const processed: string[] = [];
  let queue: Queue;
  let worker: Worker;

  const add = (conversationId: string) =>
    queue.add(
      PROCESS_CONVERSATION_JOB,
      { conversationId },
      conversationJobOptions(conversationId, QUIET_MS),
    );
  const count = (conversationId: string) => processed.filter((id) => id === conversationId).length;

  beforeAll(() => {
    queue = new Queue(queueName, { connection });
    worker = new Worker(
      queueName,
      async (job) => {
        processed.push(job.data.conversationId as string);
      },
      { connection, concurrency: 1 },
    );
    queue.on("error", () => {});
    worker.on("error", () => {});
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it("gathers a burst of messages into a single job", async () => {
    await add("burst");
    await add("burst");
    await add("burst");

    await waitUntil(() => count("burst") >= 1);
    await sleep(QUIET_MS * 2);

    expect(count("burst")).toBe(1);
  }, 10_000);

  it("keeps different conversations apart", async () => {
    await add("conv-a");
    await add("conv-b");

    await waitUntil(() => count("conv-a") >= 1 && count("conv-b") >= 1);
    await sleep(QUIET_MS * 2);

    expect(count("conv-a")).toBe(1);
    expect(count("conv-b")).toBe(1);
  }, 10_000);

  it("runs again when a new message arrives after the previous burst was processed", async () => {
    await add("again");
    await waitUntil(() => count("again") === 1);
    await sleep(QUIET_MS * 2);

    await add("again");
    await waitUntil(() => count("again") === 2);
  }, 10_000);

  it("waits for the quiet period before running", async () => {
    const started = Date.now();
    await add("slow");
    await waitUntil(() => count("slow") === 1);

    expect(Date.now() - started).toBeGreaterThanOrEqual(QUIET_MS - 50);
  }, 10_000);
});
