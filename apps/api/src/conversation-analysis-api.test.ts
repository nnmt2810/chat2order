import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: { conversation: { updateMany: vi.fn() }, message: { create: vi.fn() } },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    conversationAnalysis: { findMany: vi.fn() },
  },
}));
vi.mock("./realtime.js", () => ({ emitConversationChanged: vi.fn() }));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";
import { emitConversationChanged } from "./realtime.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

const findConversations = vi.mocked(prisma.conversation.findMany);
const countConversations = vi.mocked(prisma.conversation.count);
const findConversation = vi.mocked(prisma.conversation.findFirst);
const updateConversations = vi.mocked(prisma.conversation.updateMany);
const findAnalyses = vi.mocked(prisma.conversationAnalysis.findMany);
const emit = vi.mocked(emitConversationChanged);

const conversationRow = {
  id: "cv1",
  shopId: "shop-1",
  channel: "SIMULATOR",
  externalId: "customer:c1",
  displayName: "Chi Lan",
  customerId: "c1",
  unreadCount: 0,
  lastMessageAt: new Date("2026-10-12T00:00:00Z"),
  lastMessagePreview: "hang bi mop",
  lastMessageDirection: "INBOUND",
  needsAttention: true,
  lastIntents: ["COMPLAINT", "bogus"],
  createdAt: new Date("2026-10-12T00:00:00Z"),
  updatedAt: new Date("2026-10-12T00:00:00Z"),
  customer: { name: "Chi Lan" },
};

const analysisRow = {
  id: "a1",
  conversationId: "cv1",
  lastMessageId: "m2",
  messageCount: 2,
  status: "COMPLETED",
  intents: [{ type: "COMPLAINT", confidence: 0.9, topic: "hàng móp" }],
  needsHuman: true,
  reasons: ["COMPLAINT"],
  errorCode: null,
  model: "fake-model",
  inputTokens: 100,
  outputTokens: 20,
  latencyMs: 42,
  createdAt: new Date("2026-10-12T00:00:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/conversations/cv1/analyses")).status).toBe(401);
    expect((await request(app).post("/conversations/cv1/resolve")).status).toBe(401);
  });
});

describe("GET /conversations", () => {
  it("exposes the attention flag and only the valid recent intents", async () => {
    findConversations.mockResolvedValue([conversationRow] as never);
    countConversations.mockResolvedValue(1);

    const res = await request(app).get("/conversations").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ needsAttention: true, lastIntents: ["COMPLAINT"] });
  });

  it("filters conversations that need a person", async () => {
    findConversations.mockResolvedValue([conversationRow] as never);
    countConversations.mockResolvedValue(1);

    await request(app).get("/conversations?attention=true").set("Cookie", cookie);

    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", needsAttention: true }),
      }),
    );
  });
});

describe("GET /conversations/:id/analyses", () => {
  it("returns the latest analyses with only public fields", async () => {
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findAnalyses.mockResolvedValue([analysisRow] as never);

    const res = await request(app).get("/conversations/cv1/analyses").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toEqual({
      id: "a1",
      status: "COMPLETED",
      intents: [{ type: "COMPLAINT", confidence: 0.9, topic: "hàng móp" }],
      needsHuman: true,
      reasons: ["COMPLAINT"],
      errorCode: null,
      messageCount: 2,
      model: "fake-model",
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    expect(findConversation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cv1", shopId: "shop-1" } }),
    );
    expect(findAnalyses).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "cv1" }, take: 5 }),
    );
  });

  it("does not trust malformed stored data", async () => {
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findAnalyses.mockResolvedValue([
      { ...analysisRow, intents: "not an array", reasons: ["COMPLAINT", "bogus"] },
    ] as never);

    const res = await request(app).get("/conversations/cv1/analyses").set("Cookie", cookie);

    expect(res.body.items[0].intents).toEqual([]);
    expect(res.body.items[0].reasons).toEqual(["COMPLAINT"]);
  });

  it("returns 404 and reads nothing when the conversation is not in the shop", async () => {
    findConversation.mockResolvedValue(null);

    const res = await request(app).get("/conversations/cv-other/analyses").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
    expect(findAnalyses).not.toHaveBeenCalled();
  });
});

describe("POST /conversations/:id/resolve", () => {
  it("clears the attention flag of the shop's conversation and announces it", async () => {
    updateConversations.mockResolvedValue({ count: 1 });

    const res = await request(app).post("/conversations/cv1/resolve").set("Cookie", cookie);

    expect(res.status).toBe(204);
    expect(updateConversations).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: { needsAttention: false },
    });
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("returns 404 and announces nothing when the conversation is not in the shop", async () => {
    updateConversations.mockResolvedValue({ count: 0 });

    const res = await request(app).post("/conversations/cv-other/resolve").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("replying", () => {
  it("clears the attention flag, since the staff has answered", async () => {
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    tx.message.create.mockResolvedValue({
      id: "m9",
      conversationId: "cv1",
      direction: "OUTBOUND",
      text: "da em xin loi",
      authorId: "user-1",
      createdAt: new Date("2026-10-12T00:00:00Z"),
      author: { name: "Lan" },
    });

    const res = await request(app)
      .post("/conversations/cv1/messages")
      .set("Cookie", cookie)
      .send({ text: "da em xin loi" });

    expect(res.status).toBe(201);
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: expect.objectContaining({ needsAttention: false, unreadCount: 0 }),
    });
  });
});
