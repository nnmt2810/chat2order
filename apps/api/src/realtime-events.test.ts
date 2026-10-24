import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    conversation: { upsert: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() },
    customer: { create: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    shop: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    conversation: { updateMany: vi.fn(), update: vi.fn() },
    message: { findFirst: vi.fn() },
  },
}));

vi.mock("./realtime.js", () => ({ emitConversationChanged: vi.fn() }));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";
import { emitConversationChanged } from "./realtime.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;
const emit = vi.mocked(emitConversationChanged);

const SHOP_KEY = "7b0e6c1e-8f7a-4d2b-9c3a-5e6f7a8b9c0d";
const VISITOR_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MESSAGE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const conversationRow = {
  id: "cv1",
  shopId: "shop-1",
  channel: "WEB",
  externalId: VISITOR_ID,
  displayName: "Khach web",
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
  externalId: MESSAGE_ID,
  authorId: null,
  createdAt: new Date("2026-10-12T00:00:00Z"),
};

const outboundRow = {
  ...messageRow,
  id: "m9",
  direction: "OUTBOUND",
  text: "da em nhan don",
  authorId: "user-1",
  author: { name: "Lan" },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("realtime events", () => {
  it("announces a simulated customer message", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "c1", name: "Chi Lan" } as never);
    tx.conversation.upsert.mockResolvedValue(conversationRow);
    tx.message.create.mockResolvedValue(messageRow);

    const res = await request(app)
      .post("/simulator/messages")
      .set("Cookie", cookie)
      .send({ customerId: "c1", text: "xin chao" });

    expect(res.status).toBe(201);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("announces a new web chat message to the shop that owns the key", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as never);
    tx.conversation.upsert.mockResolvedValue(conversationRow);
    tx.message.create.mockResolvedValue(messageRow);

    const res = await request(app).post("/webhooks/web-chat").send({
      shopKey: SHOP_KEY,
      visitorId: VISITOR_ID,
      messageId: MESSAGE_ID,
      text: "xin chao",
    });

    expect(res.status).toBe(201);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("stays silent when a web chat message is sent twice", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as never);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce({ code: "P2002" });
    vi.mocked(prisma.message.findFirst).mockResolvedValue({
      ...messageRow,
      conversation: conversationRow,
    } as never);

    const res = await request(app).post("/webhooks/web-chat").send({
      shopKey: SHOP_KEY,
      visitorId: VISITOR_ID,
      messageId: MESSAGE_ID,
      text: "xin chao",
    });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("announces a staff reply, and stays silent when the conversation is not in the shop", async () => {
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    tx.message.create.mockResolvedValue(outboundRow);
    const ok = await request(app)
      .post("/conversations/cv1/messages")
      .set("Cookie", cookie)
      .send({ text: "da em nhan don" });
    expect(ok.status).toBe(201);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");

    emit.mockClear();
    tx.conversation.updateMany.mockResolvedValue({ count: 0 });
    const missing = await request(app)
      .post("/conversations/cv-other/messages")
      .set("Cookie", cookie)
      .send({ text: "hi" });
    expect(missing.status).toBe(404);
    expect(emit).not.toHaveBeenCalled();
  });

  it("announces marking as read, and stays silent for a conversation outside the shop", async () => {
    vi.mocked(prisma.conversation.updateMany).mockResolvedValue({ count: 1 });
    const ok = await request(app).post("/conversations/cv1/read").set("Cookie", cookie);
    expect(ok.status).toBe(204);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");

    emit.mockClear();
    vi.mocked(prisma.conversation.updateMany).mockResolvedValue({ count: 0 });
    const missing = await request(app).post("/conversations/cv-other/read").set("Cookie", cookie);
    expect(missing.status).toBe(404);
    expect(emit).not.toHaveBeenCalled();
  });

  it("announces linking and unlinking a customer", async () => {
    vi.mocked(prisma.conversation.update).mockResolvedValue(conversationRow as never);

    const res = await request(app)
      .patch("/conversations/cv1")
      .set("Cookie", cookie)
      .send({ customerId: null });

    expect(res.status).toBe(200);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });

  it("announces creating a customer from a conversation", async () => {
    tx.conversation.findFirst.mockResolvedValueOnce({ customerId: null }).mockResolvedValueOnce({
      ...conversationRow,
      customerId: "c-new",
      customer: { name: "Khach" },
    });
    tx.customer.create.mockResolvedValue({ id: "c-new" });
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post("/conversations/cv1/customer")
      .set("Cookie", cookie)
      .send({ name: "Khach", phone: "", address: "", note: "" });

    expect(res.status).toBe(201);
    expect(emit).toHaveBeenCalledWith("shop-1", "cv1");
  });
});
