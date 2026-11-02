import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "./llm/errors.js";
import type { LlmGateway } from "./llm/types.js";

const { tx } = vi.hoisted(() => ({
  tx: {
    conversationAnalysis: { upsert: vi.fn() },
    conversation: { updateMany: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: { $transaction: vi.fn(), message: { findMany: vi.fn() } },
}));
vi.mock("./lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./realtime.js", () => ({ emitConversationChanged: vi.fn() }));
vi.mock("./llm/gateway.js", () => ({ getLlmGateway: vi.fn() }));

import { getLlmGateway } from "./llm/gateway.js";
import { prisma } from "./lib/prisma.js";
import { emitConversationChanged } from "./realtime.js";
import { handleBatch } from "./services/batch-handler.js";
import { analyzeBatch } from "./services/intent-analysis.js";

const findMessages = vi.mocked(prisma.message.findMany);
const transaction = vi.mocked(prisma.$transaction);
const emit = vi.mocked(emitConversationChanged);
const gatewayFor = vi.mocked(getLlmGateway);

const firstAt = new Date("2026-10-12T00:00:00Z");
const batch = {
  shopId: "shop-1",
  conversationId: "cv1",
  messages: [
    { id: "m1", text: "lay 2 thung nuoc", createdAt: firstAt },
    { id: "m2", text: "mai giao nha", createdAt: new Date("2026-10-12T00:00:05Z") },
  ],
};

function fakeGateway(behaviour: unknown) {
  const generateStructured = vi.fn(
    async (request: { schema: { parse: (value: unknown) => unknown }; prompt: string }) => {
      if (behaviour instanceof Error) throw behaviour;
      return {
        data: request.schema.parse(behaviour),
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        latencyMs: 42,
      };
    },
  );
  const gateway = {
    provider: "fake",
    model: "fake-model",
    generateStructured,
    generateText: vi.fn(),
  } as unknown as LlmGateway;
  return { gateway, generateStructured };
}

const orderOnly = {
  intents: [{ type: "ORDER", confidence: 0.95, topic: "" }],
  asksForHuman: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  findMessages.mockResolvedValue([]);
  transaction.mockImplementation(((fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx)) as never);
});

describe("analyzeBatch", () => {
  it("classifies the whole batch with recent history and stores one analysis", async () => {
    findMessages.mockResolvedValue([
      { direction: "OUTBOUND", text: "da con a" },
      { direction: "INBOUND", text: "shop con hang khong" },
    ] as never);
    const { gateway, generateStructured } = fakeGateway(orderOnly);

    await analyzeBatch(batch, gateway);

    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: "cv1",
          createdAt: { lt: firstAt },
          conversation: { shopId: "shop-1" },
        },
        take: 6,
      }),
    );
    const prompt = generateStructured.mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("Khách: shop con hang khong\nCửa hàng: da con a");
    expect(prompt).toContain("1. lay 2 thung nuoc\n2. mai giao nha");

    expect(tx.conversationAnalysis.upsert).toHaveBeenCalledWith({
      where: { lastMessageId: "m2" },
      create: expect.objectContaining({
        conversationId: "cv1",
        lastMessageId: "m2",
        messageCount: 2,
        status: "COMPLETED",
        needsHuman: false,
        reasons: [],
        errorCode: null,
        model: "fake-model",
        inputTokens: 100,
        outputTokens: 20,
        latencyMs: 42,
        intents: [{ type: "ORDER", confidence: 0.95, topic: "" }],
      }),
      update: expect.objectContaining({ status: "COMPLETED", needsHuman: false }),
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: { lastIntents: ["ORDER"] },
    });
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("flags the conversation when a complaint shows up", async () => {
    const { gateway } = fakeGateway({
      intents: [{ type: "COMPLAINT", confidence: 0.9, topic: "hàng móp" }],
      asksForHuman: false,
    });

    await analyzeBatch(batch, gateway);

    expect(tx.conversationAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ needsHuman: true, reasons: ["COMPLAINT"] }),
      }),
    );
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: { lastIntents: ["COMPLAINT"], needsAttention: true },
    });
  });

  it("writes to the same analysis when the same batch runs again", async () => {
    const { gateway } = fakeGateway(orderOnly);

    await analyzeBatch(batch, gateway);
    await analyzeBatch(batch, gateway);

    const keys = tx.conversationAnalysis.upsert.mock.calls.map(
      ([arg]) => (arg as { where: { lastMessageId: string } }).where.lastMessageId,
    );
    expect(keys).toEqual(["m2", "m2"]);
  });

  it("records a permanent AI failure, flags the conversation and does not throw", async () => {
    const { gateway } = fakeGateway(
      new LlmError("PROVIDER_ERROR", "bad key", false, { status: 401 }),
    );

    await expect(analyzeBatch(batch, gateway)).resolves.toBeUndefined();

    expect(tx.conversationAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "FAILED",
          errorCode: "PROVIDER_ERROR",
          needsHuman: true,
          reasons: ["AI_FAILED"],
          intents: [],
          inputTokens: null,
        }),
      }),
    );
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: { lastIntents: [], needsAttention: true },
    });
  });

  it("treats a model answer that breaks the schema as a failure that is not retried", async () => {
    const { gateway } = fakeGateway(new LlmError("INVALID_OUTPUT", "bad shape", false));

    await expect(analyzeBatch(batch, gateway)).resolves.toBeUndefined();

    expect(tx.conversationAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ errorCode: "INVALID_OUTPUT" }) }),
    );
  });

  it("rethrows a temporary AI failure and stores nothing, so the queue retries", async () => {
    const { gateway } = fakeGateway(new LlmError("RATE_LIMITED", "slow down", true));

    await expect(analyzeBatch(batch, gateway)).rejects.toMatchObject({ code: "RATE_LIMITED" });

    expect(transaction).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected error", async () => {
    const { gateway } = fakeGateway(new Error("database is down"));

    await expect(analyzeBatch(batch, gateway)).rejects.toThrow("database is down");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does nothing for an empty batch", async () => {
    const { gateway, generateStructured } = fakeGateway(orderOnly);

    await analyzeBatch({ ...batch, messages: [] }, gateway);

    expect(generateStructured).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("handleBatch", () => {
  it("skips the batch without touching the database when AI is off", async () => {
    gatewayFor.mockReturnValue(null);

    await handleBatch(batch);

    expect(findMessages).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("analyzes the batch when AI is on", async () => {
    const { gateway, generateStructured } = fakeGateway(orderOnly);
    gatewayFor.mockReturnValue(gateway);

    await handleBatch(batch);

    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(tx.conversationAnalysis.upsert).toHaveBeenCalledTimes(1);
  });
});
