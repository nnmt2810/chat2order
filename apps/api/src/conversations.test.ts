import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    conversation: { upsert: vi.fn() },
    message: { create: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    customer: { findFirst: vi.fn() },
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    message: { findMany: vi.fn() },
  },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

const findCustomer = vi.mocked(prisma.customer.findFirst);
const findConversations = vi.mocked(prisma.conversation.findMany);
const countConversations = vi.mocked(prisma.conversation.count);
const findConversation = vi.mocked(prisma.conversation.findFirst);
const markRead = vi.mocked(prisma.conversation.updateMany);
const findMessages = vi.mocked(prisma.message.findMany);

const conversationRow = {
  id: "cv1",
  shopId: "shop-1",
  channel: "SIMULATOR",
  externalId: "customer:c1",
  displayName: "Chi Lan",
  customerId: "c1",
  unreadCount: 1,
  lastMessageAt: new Date("2026-10-12T00:00:00Z"),
  lastMessagePreview: "xin chao",
  lastMessageDirection: "INBOUND",
  createdAt: new Date("2026-10-12T00:00:00Z"),
  updatedAt: new Date("2026-10-12T00:00:00Z"),
  customer: { name: "Chi Lan" },
};

const messageRow = {
  id: "m1",
  conversationId: "cv1",
  direction: "INBOUND",
  text: "xin chao",
  createdAt: new Date("2026-10-12T00:00:00Z"),
};

const customer = { id: "c1", shopId: "shop-1", name: "Chi Lan", isActive: true };

function msg(id: string) {
  return { ...messageRow, id, text: `tin ${id}` };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/conversations")).status).toBe(401);
    expect((await request(app).post("/simulator/messages").send({ text: "hi" })).status).toBe(401);
  });
});

describe("GET /conversations", () => {
  it("only queries the shop from the token and builds the title", async () => {
    findConversations.mockResolvedValue([conversationRow] as never);
    countConversations.mockResolvedValue(1);

    const res = await request(app).get("/conversations").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.items[0]).toMatchObject({
      id: "cv1",
      title: "Chi Lan",
      channel: "SIMULATOR",
      unreadCount: 1,
      customerName: "Chi Lan",
    });
    expect(res.body.items[0].shopId).toBeUndefined();
    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: "shop-1" } }),
    );
  });

  it("falls back to the visitor name, then to an anonymous title", async () => {
    findConversations.mockResolvedValue([
      { ...conversationRow, id: "cv2", customer: null, customerId: null, displayName: "Khach la" },
      { ...conversationRow, id: "cv3", customer: null, customerId: null, displayName: "" },
    ] as never);
    countConversations.mockResolvedValue(2);

    const res = await request(app).get("/conversations").set("Cookie", cookie);

    expect(res.body.items[0].title).toBe("Khach la");
    expect(res.body.items[1].title).toBe("Khách ẩn danh");
  });

  it("filters unread conversations", async () => {
    findConversations.mockResolvedValue([conversationRow] as never);
    countConversations.mockResolvedValue(1);

    await request(app).get("/conversations?unread=true").set("Cookie", cookie);

    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", unreadCount: { gt: 0 } }),
      }),
    );
  });

  it("searches by visitor name or customer name", async () => {
    findConversations.mockResolvedValue([conversationRow] as never);
    countConversations.mockResolvedValue(1);

    await request(app).get("/conversations?q=lan").set("Cookie", cookie);

    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", OR: expect.any(Array) }),
      }),
    );
  });

  it("rejects an oversized page size with 400", async () => {
    const res = await request(app).get("/conversations?pageSize=1000").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /conversations/:id", () => {
  it("returns the conversation", async () => {
    findConversation.mockResolvedValue(conversationRow as never);

    const res = await request(app).get("/conversations/cv1").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.conversation.id).toBe("cv1");
    expect(findConversation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cv1", shopId: "shop-1" } }),
    );
  });

  it("returns 404 for a conversation that is not in the shop", async () => {
    findConversation.mockResolvedValue(null);

    const res = await request(app).get("/conversations/cv-other").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});

describe("GET /conversations/:id/messages", () => {
  it("returns messages oldest first and reports whether there are older ones", async () => {
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findMessages.mockResolvedValue([msg("m3"), msg("m2"), msg("m1")] as never);

    const res = await request(app).get("/conversations/cv1/messages?limit=2").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual(["m2", "m3"]);
    expect(findMessages).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it("reports no older messages when everything fits", async () => {
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findMessages.mockResolvedValue([msg("m2"), msg("m1")] as never);

    const res = await request(app).get("/conversations/cv1/messages").set("Cookie", cookie);

    expect(res.body.hasMore).toBe(false);
    expect(res.body.items).toHaveLength(2);
  });

  it("continues from the cursor given in `before`", async () => {
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findMessages.mockResolvedValue([] as never);

    await request(app).get("/conversations/cv1/messages?before=m5").set("Cookie", cookie);

    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "m5" }, skip: 1 }),
    );
  });

  it("returns 404 when the conversation is not in the shop", async () => {
    findConversation.mockResolvedValue(null);

    const res = await request(app).get("/conversations/cv-other/messages").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
    expect(findMessages).not.toHaveBeenCalled();
  });
});

describe("POST /conversations/:id/read", () => {
  it("resets the unread counter for the shop's conversation", async () => {
    markRead.mockResolvedValue({ count: 1 });

    const res = await request(app).post("/conversations/cv1/read").set("Cookie", cookie);

    expect(res.status).toBe(204);
    expect(markRead).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: { unreadCount: 0 },
    });
  });

  it("returns 404 when the conversation is not in the shop", async () => {
    markRead.mockResolvedValue({ count: 0 });

    const res = await request(app).post("/conversations/cv-other/read").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});

describe("POST /simulator/messages", () => {
  function mockIngest() {
    tx.conversation.upsert.mockResolvedValue(conversationRow);
    tx.message.create.mockResolvedValue(messageRow);
  }

  function send(body: Record<string, unknown>) {
    return request(app).post("/simulator/messages").set("Cookie", cookie).send(body);
  }

  it("saves a message from an existing customer into that customer's conversation", async () => {
    findCustomer.mockResolvedValue(customer as never);
    mockIngest();

    const res = await send({ customerId: "c1", text: "xin chao" });

    expect(res.status).toBe(201);
    expect(res.body.conversation.id).toBe("cv1");
    expect(res.body.message).toMatchObject({ id: "m1", direction: "INBOUND", text: "xin chao" });
    expect(findCustomer).toHaveBeenCalledWith({
      where: { id: "c1", shopId: "shop-1", isActive: true },
    });
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_channel_externalId: {
            shopId: "shop-1",
            channel: "SIMULATOR",
            externalId: "customer:c1",
          },
        },
        create: expect.objectContaining({ customerId: "c1", unreadCount: 1 }),
        update: expect.objectContaining({
          unreadCount: { increment: 1 },
          lastMessageDirection: "INBOUND",
        }),
      }),
    );
    expect(tx.message.create).toHaveBeenCalledWith({
      data: { conversationId: "cv1", direction: "INBOUND", text: "xin chao" },
    });
  });

  it("creates an unlinked conversation for an unknown visitor", async () => {
    mockIngest();

    const res = await send({ visitorId: "v1", visitorName: "Khach la", text: "con hang khong" });

    expect(res.status).toBe(201);
    expect(findCustomer).not.toHaveBeenCalled();
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_channel_externalId: {
            shopId: "shop-1",
            channel: "SIMULATOR",
            externalId: "visitor:v1",
          },
        },
        create: expect.objectContaining({ customerId: null, displayName: "Khach la" }),
      }),
    );
  });

  it("returns 404 and writes nothing when the customer is not in the shop", async () => {
    findCustomer.mockResolvedValue(null);

    const res = await send({ customerId: "c-other", text: "xin chao" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(tx.conversation.upsert).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("always uses the shop from the token, never one from the body", async () => {
    findCustomer.mockResolvedValue(customer as never);
    mockIngest();

    const res = await send({ customerId: "c1", text: "xin chao", shopId: "shop-evil" });

    expect(res.status).toBe(201);
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_channel_externalId: expect.objectContaining({ shopId: "shop-1" }),
        },
      }),
    );
  });

  it("trims the text, collapses whitespace and truncates the preview", async () => {
    findCustomer.mockResolvedValue(customer as never);
    mockIngest();

    await send({ customerId: "c1", text: "  xin   chao\n ban  " });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: { conversationId: "cv1", direction: "INBOUND", text: "xin   chao\n ban" },
    });
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastMessagePreview: "xin chao ban" }),
      }),
    );

    await send({ customerId: "c1", text: "a".repeat(300) });
    expect(tx.conversation.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastMessagePreview: "a".repeat(100) }),
      }),
    );
  });

  it("rejects an empty or oversized text with 400", async () => {
    for (const text of ["   ", "a".repeat(2001)]) {
      const res = await send({ customerId: "c1", text });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("requires exactly one of customerId and visitorId", async () => {
    for (const body of [{ text: "hi" }, { customerId: "c1", visitorId: "v1", text: "hi" }]) {
      const res = await send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
