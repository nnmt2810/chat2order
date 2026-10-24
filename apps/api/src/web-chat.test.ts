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
    shop: { findUnique: vi.fn() },
    conversation: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();

const SHOP_KEY = "7b0e6c1e-8f7a-4d2b-9c3a-5e6f7a8b9c0d";
const VISITOR_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MESSAGE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const findShop = vi.mocked(prisma.shop.findUnique);
const findConversation = vi.mocked(prisma.conversation.findUnique);
const findMessages = vi.mocked(prisma.message.findMany);
const findMessage = vi.mocked(prisma.message.findFirst);
const transaction = vi.mocked(prisma.$transaction);

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

const validBody = {
  shopKey: SHOP_KEY,
  visitorId: VISITOR_ID,
  messageId: MESSAGE_ID,
  displayName: "Khach web",
  text: "xin chao",
};

function send(body: unknown) {
  return request(app)
    .post("/webhooks/web-chat")
    .send(body as object);
}

function poll(query = "", visitor: string | null = VISITOR_ID) {
  const req = request(app).get(`/webhooks/web-chat/messages?shopKey=${SHOP_KEY}${query}`);
  return visitor === null ? req : req.set("X-Visitor-Id", visitor);
}

function mockIngest() {
  findShop.mockResolvedValue({ id: "shop-1" } as never);
  tx.conversation.upsert.mockResolvedValue(conversationRow);
  tx.message.create.mockResolvedValue(messageRow);
}

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(((fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx)) as never);
});

describe("CORS", () => {
  it("answers the preflight for any origin, without credentials", async () => {
    const res = await request(app)
      .options("/webhooks/web-chat")
      .set("Origin", "https://shop.example.com")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-visitor-id");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-visitor-id/i);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("also allows any origin on real requests, without credentials", async () => {
    findShop.mockResolvedValue(null);

    const res = await send(validBody).set("Origin", "https://shop.example.com");

    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("keeps the strict CORS policy on the rest of the API", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});

describe("POST /webhooks/web-chat", () => {
  it("saves a message from an anonymous visitor into the shop identified by the key", async () => {
    mockIngest();

    const res = await send(validBody);

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      message: {
        id: "m1",
        direction: "INBOUND",
        text: "xin chao",
        createdAt: "2026-10-12T00:00:00.000Z",
      },
      duplicate: false,
    });
    expect(findShop).toHaveBeenCalledWith({
      where: { webChatKey: SHOP_KEY },
      select: { id: true },
    });
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_channel_externalId: { shopId: "shop-1", channel: "WEB", externalId: VISITOR_ID },
        },
        create: expect.objectContaining({ customerId: null, displayName: "Khach web" }),
      }),
    );
    expect(tx.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "cv1",
        direction: "INBOUND",
        text: "xin chao",
        externalId: MESSAGE_ID,
      },
    });
  });

  it("returns 404 and saves nothing for an unknown shop key", async () => {
    findShop.mockResolvedValue(null);

    const res = await send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SHOP_NOT_FOUND");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("answers 200 with duplicate=true when the same message is sent again", async () => {
    findShop.mockResolvedValue({ id: "shop-1" } as never);
    transaction.mockRejectedValueOnce({ code: "P2002" });
    findMessage.mockResolvedValue({ ...messageRow, conversation: conversationRow } as never);

    const res = await send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.message.id).toBe("m1");
    expect(findMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          externalId: MESSAGE_ID,
          conversation: { shopId: "shop-1", channel: "WEB", externalId: VISITOR_ID },
        },
      }),
    );
  });

  it("retries once when two first messages race to create the conversation", async () => {
    mockIngest();
    transaction.mockRejectedValueOnce({ code: "P2002" });
    findMessage.mockResolvedValue(null);

    const res = await send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up with 409 when the conflict keeps happening", async () => {
    findShop.mockResolvedValue({ id: "shop-1" } as never);
    transaction.mockRejectedValue({ code: "P2002" });
    findMessage.mockResolvedValue(null);

    const res = await send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MESSAGE_CONFLICT");
  });

  it("does not expose internal data in the response", async () => {
    mockIngest();

    const res = await send(validBody);

    expect(res.body.conversation).toBeUndefined();
    expect(res.body.message.authorName).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("shop-1");
  });

  it("rejects ids that are not UUIDs, so visitor ids cannot be guessed", async () => {
    for (const patch of [{ shopKey: "shop-1" }, { visitorId: "khach-1" }, { messageId: "m1" }]) {
      const res = await send({ ...validBody, ...patch });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized text", async () => {
    for (const text of ["   ", "a".repeat(2001)]) {
      const res = await send({ ...validBody, text });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects a request without a JSON body", async () => {
    const res = await request(app)
      .post("/webhooks/web-chat")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(validBody));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a body larger than 8 KB", async () => {
    const res = await send({ ...validBody, text: "a".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("works without any login cookie and ignores a shopId sent in the body", async () => {
    mockIngest();

    const res = await send({ ...validBody, shopId: "shop-evil" });

    expect(res.status).toBe(201);
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_channel_externalId: expect.objectContaining({ shopId: "shop-1" }),
        },
      }),
    );
  });
});

describe("GET /webhooks/web-chat/messages", () => {
  it("returns the visitor's own conversation, oldest first, with only public fields", async () => {
    findShop.mockResolvedValue({ id: "shop-1" } as never);
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findMessages.mockResolvedValue([
      {
        id: "m2",
        direction: "OUTBOUND",
        text: "da con hang a",
        authorId: "user-1",
        createdAt: new Date("2026-10-12T00:01:00Z"),
      },
      messageRow,
    ] as never);

    const res = await poll();

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.items).toEqual([
      {
        id: "m1",
        direction: "INBOUND",
        text: "xin chao",
        createdAt: "2026-10-12T00:00:00.000Z",
      },
      {
        id: "m2",
        direction: "OUTBOUND",
        text: "da con hang a",
        createdAt: "2026-10-12T00:01:00.000Z",
      },
    ]);
    expect(findConversation).toHaveBeenCalledWith({
      where: {
        shopId_channel_externalId: { shopId: "shop-1", channel: "WEB", externalId: VISITOR_ID },
      },
      select: { id: true },
    });
  });

  it("only returns newer messages when `after` is given", async () => {
    findShop.mockResolvedValue({ id: "shop-1" } as never);
    findConversation.mockResolvedValue({ id: "cv1" } as never);
    findMessages.mockResolvedValue([] as never);

    const res = await poll("&after=m1");

    expect(res.status).toBe(200);
    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: "cv1" },
        cursor: { id: "m1" },
        skip: 1,
      }),
    );
  });

  it("returns an empty list when the visitor has never sent a message", async () => {
    findShop.mockResolvedValue({ id: "shop-1" } as never);
    findConversation.mockResolvedValue(null);

    const res = await poll();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(findMessages).not.toHaveBeenCalled();
  });

  it("requires a valid visitor id header", async () => {
    for (const visitor of [null, "khach-1"]) {
      const res = await poll("", visitor);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(findConversation).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown shop key", async () => {
    findShop.mockResolvedValue(null);

    const res = await poll();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SHOP_NOT_FOUND");
  });
});

describe("GET /shop/web-chat", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/shop/web-chat");
    expect(res.status).toBe(401);
  });

  it("returns the web chat key of the shop from the token", async () => {
    findShop.mockResolvedValue({ webChatKey: SHOP_KEY } as never);
    const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

    const res = await request(app).get("/shop/web-chat").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ webChatKey: SHOP_KEY });
    expect(findShop).toHaveBeenCalledWith({
      where: { id: "shop-1" },
      select: { webChatKey: true },
    });
  });
});
