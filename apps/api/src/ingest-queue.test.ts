import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    conversation: { upsert: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    shop: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    message: { findFirst: vi.fn() },
  },
}));

vi.mock("./queue/conversation-queue.js", () => ({ enqueueConversationProcessing: vi.fn() }));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";
import { enqueueConversationProcessing } from "./queue/conversation-queue.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;
const enqueue = vi.mocked(enqueueConversationProcessing);

const SHOP_KEY = "7b0e6c1e-8f7a-4d2b-9c3a-5e6f7a8b9c0d";
const VISITOR_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MESSAGE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const conversationRow = {
  id: "cv1",
  shopId: "shop-1",
  channel: "WEB",
  externalId: VISITOR_ID,
  displayName: "",
  customerId: null,
  unreadCount: 1,
  lastMessageAt: new Date("2026-10-12T00:00:00Z"),
  lastMessagePreview: "xin chao",
  lastMessageDirection: "INBOUND",
  createdAt: new Date("2026-10-12T00:00:00Z"),
  updatedAt: new Date("2026-10-12T00:00:00Z"),
  customer: null,
};

const messageRow = {
  id: "m1",
  conversationId: "cv1",
  direction: "INBOUND",
  text: "xin chao",
  createdAt: new Date("2026-10-12T00:00:00Z"),
};

const webChatBody = {
  shopKey: SHOP_KEY,
  visitorId: VISITOR_ID,
  messageId: MESSAGE_ID,
  text: "xin chao",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
  tx.conversation.upsert.mockResolvedValue(conversationRow);
  tx.message.create.mockResolvedValue(messageRow);
});

describe("queueing inbound messages", () => {
  it("queues processing for a simulated customer message", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "c1", name: "Chi Lan" } as never);

    const res = await request(app)
      .post("/simulator/messages")
      .set("Cookie", cookie)
      .send({ customerId: "c1", text: "xin chao" });

    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("queues processing for a new web chat message", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as never);

    const res = await request(app).post("/webhooks/web-chat").send(webChatBody);

    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("does not queue anything when the same web chat message is sent twice", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as never);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce({ code: "P2002" });
    vi.mocked(prisma.message.findFirst).mockResolvedValue({
      ...messageRow,
      conversation: conversationRow,
    } as never);

    const res = await request(app).post("/webhooks/web-chat").send(webChatBody);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not queue anything for a staff reply", async () => {
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    tx.message.create.mockResolvedValue({
      ...messageRow,
      id: "m9",
      direction: "OUTBOUND",
      author: { name: "Lan" },
    });

    const res = await request(app)
      .post("/conversations/cv1/messages")
      .set("Cookie", cookie)
      .send({ text: "da em nhan don" });

    expect(res.status).toBe(201);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
