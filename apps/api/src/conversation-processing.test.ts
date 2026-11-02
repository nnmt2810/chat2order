import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "./llm/errors.js";

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    message: { findMany: vi.fn(), updateMany: vi.fn() },
    conversation: { findMany: vi.fn() },
  },
}));
vi.mock("./services/batch-handler.js", () => ({ handleBatch: vi.fn() }));

import { prisma } from "./lib/prisma.js";
import { handleBatch } from "./services/batch-handler.js";
import {
  MAX_PROCESS_ATTEMPTS,
  findStaleConversations,
  processConversation,
} from "./services/conversation-processing.js";

const findMessages = vi.mocked(prisma.message.findMany);
const updateMessages = vi.mocked(prisma.message.updateMany);
const findConversations = vi.mocked(prisma.conversation.findMany);
const handle = vi.mocked(handleBatch);

const msg = (id: string) => ({
  id,
  text: `tin ${id}`,
  createdAt: new Date("2026-10-12T00:00:00Z"),
});

beforeEach(() => {
  vi.resetAllMocks();
  updateMessages.mockResolvedValue({ count: 1 });
  handle.mockResolvedValue(undefined);
});

describe("processConversation", () => {
  it("handles the unprocessed inbound messages as one batch and marks exactly those as processed", async () => {
    findMessages.mockResolvedValueOnce([msg("m1"), msg("m2")] as never).mockResolvedValueOnce([]);

    const result = await processConversation("shop-1", "cv1");

    expect(result).toEqual({ rounds: 1, messages: 2 });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith({
      shopId: "shop-1",
      conversationId: "cv1",
      messages: [msg("m1"), msg("m2")],
    });
    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] }, processedAt: null },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("only looks at inbound, unprocessed, non-exhausted messages of the shop's own conversation", async () => {
    findMessages.mockResolvedValue([]);

    await processConversation("shop-1", "cv1");

    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: "cv1",
          direction: "INBOUND",
          processedAt: null,
          processAttempts: { lt: MAX_PROCESS_ATTEMPTS },
          conversation: { shopId: "shop-1" },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("does nothing when every message has already been processed", async () => {
    findMessages.mockResolvedValue([]);

    const result = await processConversation("shop-1", "cv1");

    expect(result).toEqual({ rounds: 0, messages: 0 });
    expect(handle).not.toHaveBeenCalled();
    expect(updateMessages).not.toHaveBeenCalled();
  });

  it("picks up messages that arrive while it is working, in a following round", async () => {
    findMessages
      .mockResolvedValueOnce([msg("m1"), msg("m2")] as never)
      .mockResolvedValueOnce([msg("m3")] as never)
      .mockResolvedValueOnce([]);

    const result = await processConversation("shop-1", "cv1");

    expect(result).toEqual({ rounds: 2, messages: 3 });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("stops after a bounded number of rounds even if messages keep arriving", async () => {
    findMessages.mockResolvedValue([msg("m1")] as never);

    const result = await processConversation("shop-1", "cv1");

    expect(result.rounds).toBe(5);
    expect(handle).toHaveBeenCalledTimes(5);
  });

  it("counts a failed attempt, leaves the messages unprocessed and rethrows", async () => {
    findMessages.mockResolvedValueOnce([msg("m1"), msg("m2")] as never);
    handle.mockRejectedValue(new Error("boom"));

    await expect(processConversation("shop-1", "cv1")).rejects.toThrow("boom");

    expect(updateMessages).toHaveBeenCalledTimes(1);
    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] } },
      data: { processAttempts: { increment: 1 } },
    });
  });

  it("does not count a temporary AI failure against the messages", async () => {
    findMessages.mockResolvedValueOnce([msg("m1")] as never);
    handle.mockRejectedValue(new LlmError("RATE_LIMITED", "slow down", true));

    await expect(processConversation("shop-1", "cv1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    expect(updateMessages).not.toHaveBeenCalled();
  });

  it("still counts a permanent AI failure", async () => {
    findMessages.mockResolvedValueOnce([msg("m1")] as never);
    handle.mockRejectedValue(new LlmError("PROVIDER_ERROR", "bad key", false));

    await expect(processConversation("shop-1", "cv1")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });

    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      data: { processAttempts: { increment: 1 } },
    });
  });
});

describe("findStaleConversations", () => {
  it("finds conversations with old unprocessed inbound messages, within the last 24 hours", async () => {
    findConversations.mockResolvedValue([{ id: "cv1", shopId: "shop-1" }] as never);
    const cutoff = new Date("2026-10-12T00:00:00Z");

    const result = await findStaleConversations(cutoff);

    expect(result).toEqual([{ shopId: "shop-1", conversationId: "cv1" }]);
    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messages: {
            some: {
              direction: "INBOUND",
              processedAt: null,
              processAttempts: { lt: MAX_PROCESS_ATTEMPTS },
              createdAt: { lt: cutoff, gt: expect.any(Date) },
            },
          },
        },
        take: 100,
      }),
    );
  });

  it("accepts a custom lower bound and limit", async () => {
    findConversations.mockResolvedValue([]);
    const cutoff = new Date("2026-10-12T00:00:00Z");
    const newerThan = new Date("2026-10-11T00:00:00Z");

    await findStaleConversations(cutoff, { newerThan, limit: 10 });

    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messages: {
            some: expect.objectContaining({ createdAt: { lt: cutoff, gt: newerThan } }),
          },
        },
        take: 10,
      }),
    );
  });
});
