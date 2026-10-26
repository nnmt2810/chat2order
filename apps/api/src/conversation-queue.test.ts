import { beforeEach, describe, expect, it, vi } from "vitest";

const { addMock, closeMock, queueInstances } = vi.hoisted(() => ({
  addMock: vi.fn(),
  closeMock: vi.fn(),
  queueInstances: [] as unknown[],
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = addMock;
    on = vi.fn();
    close = closeMock;
    constructor() {
      queueInstances.push(this);
    }
  },
}));

import { env } from "./config/env.js";
import { redisConnection } from "./queue/connection.js";

async function loadQueueModule() {
  vi.resetModules();
  return import("./queue/conversation-queue.js");
}

beforeEach(() => {
  vi.resetAllMocks();
  queueInstances.length = 0;
  addMock.mockResolvedValue({});
  closeMock.mockResolvedValue(undefined);
});

describe("conversationJobOptions", () => {
  it("debounces per conversation: delay equals the deduplication ttl, extended and replaced by newer jobs", async () => {
    const { conversationJobOptions } = await loadQueueModule();

    expect(conversationJobOptions("cv1", 4000)).toMatchObject({
      delay: 4000,
      deduplication: { id: "conv-cv1", ttl: 4000, extend: true, replace: true },
      attempts: 3,
    });
  });

  it("uses a different deduplication id for each conversation", async () => {
    const { conversationJobOptions } = await loadQueueModule();

    expect(conversationJobOptions("a", 1000).deduplication?.id).not.toBe(
      conversationJobOptions("b", 1000).deduplication?.id,
    );
  });
});

describe("enqueueConversationProcessing", () => {
  it("does nothing until the queue has been started", async () => {
    const mod = await loadQueueModule();

    mod.enqueueConversationProcessing("shop-1", "cv1");

    expect(queueInstances).toHaveLength(0);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("creates only one queue however many times it is started", async () => {
    const mod = await loadQueueModule();

    mod.startConversationQueue();
    mod.startConversationQueue();

    expect(queueInstances).toHaveLength(1);
  });

  it("adds a debounced job for the conversation once started", async () => {
    const mod = await loadQueueModule();
    mod.startConversationQueue();

    mod.enqueueConversationProcessing("shop-1", "cv1");

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      mod.PROCESS_CONVERSATION_JOB,
      { shopId: "shop-1", conversationId: "cv1" },
      mod.conversationJobOptions("cv1", env.BATCH_QUIET_MS),
    );
  });

  it("never throws when Redis rejects the job, so receiving a message cannot fail", async () => {
    const mod = await loadQueueModule();
    mod.startConversationQueue();
    addMock.mockRejectedValue(new Error("redis down"));

    expect(() => mod.enqueueConversationProcessing("shop-1", "cv1")).not.toThrow();
    // Cho lời hứa bị từ chối kịp chạy: nếu lỗi không được nuốt, vitest sẽ báo unhandled rejection
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("stops enqueueing after the queue is closed", async () => {
    const mod = await loadQueueModule();
    mod.startConversationQueue();

    await mod.closeConversationQueue();
    mod.enqueueConversationProcessing("shop-1", "cv1");

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe("redisConnection", () => {
  it("parses host, port, credentials and database from the url", () => {
    expect(redisConnection("redis://user:pa%40ss@cache.example.com:6380/2")).toEqual({
      host: "cache.example.com",
      port: 6380,
      username: "user",
      password: "pa@ss",
      db: 2,
    });
  });

  it("uses the default port and no extras for a plain url", () => {
    expect(redisConnection("redis://localhost")).toEqual({ host: "localhost", port: 6379 });
  });

  it("enables tls for rediss urls", () => {
    expect(redisConnection("rediss://cache.example.com:6379")).toMatchObject({ tls: {} });
  });
});
