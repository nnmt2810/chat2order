import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    conversation: { updateMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() },
    customer: { create: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    customer: { findFirst: vi.fn() },
    conversation: { update: vi.fn() },
  },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

const findCustomer = vi.mocked(prisma.customer.findFirst);
const updateConversation = vi.mocked(prisma.conversation.update);

const conversationRow = {
  id: "cv1",
  shopId: "shop-1",
  channel: "SIMULATOR",
  externalId: "visitor:v1",
  displayName: "Khach la",
  customerId: "c1",
  unreadCount: 0,
  lastMessageAt: new Date("2026-10-12T00:00:00Z"),
  lastMessagePreview: "xin chao",
  lastMessageDirection: "INBOUND",
  createdAt: new Date("2026-10-12T00:00:00Z"),
  updatedAt: new Date("2026-10-12T00:00:00Z"),
  customer: { name: "Chi Lan" },
};

const outboundRow = {
  id: "m9",
  conversationId: "cv1",
  direction: "OUTBOUND",
  text: "da em nhan don",
  authorId: "user-1",
  createdAt: new Date("2026-10-12T00:00:00Z"),
  author: { name: "Lan" },
};

const validCustomer = {
  name: "Khach la",
  phone: "+84 901 234 567",
  address: "",
  note: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    expect(
      (await request(app).post("/conversations/cv1/messages").send({ text: "hi" })).status,
    ).toBe(401);
    expect((await request(app).patch("/conversations/cv1").send({ customerId: null })).status).toBe(
      401,
    );
    expect(
      (await request(app).post("/conversations/cv1/customer").send(validCustomer)).status,
    ).toBe(401);
  });
});

describe("POST /conversations/:id/messages (reply)", () => {
  function reply(body: Record<string, unknown>) {
    return request(app).post("/conversations/cv1/messages").set("Cookie", cookie).send(body);
  }

  it("saves an outbound message by the logged-in user and marks the conversation as read", async () => {
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    tx.message.create.mockResolvedValue(outboundRow);

    const res = await reply({ text: "  da em nhan don  " });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      id: "m9",
      direction: "OUTBOUND",
      text: "da em nhan don",
      authorName: "Lan",
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1" },
      data: expect.objectContaining({
        unreadCount: 0,
        lastMessageDirection: "OUTBOUND",
        lastMessagePreview: "da em nhan don",
      }),
    });
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversationId: "cv1",
          direction: "OUTBOUND",
          text: "da em nhan don",
          authorId: "user-1",
        },
      }),
    );
  });

  it("returns 404 and creates no message when the conversation is not in the shop", async () => {
    tx.conversation.updateMany.mockResolvedValue({ count: 0 });

    const res = await reply({ text: "xin chao" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized text with 400", async () => {
    for (const text of ["   ", "a".repeat(2001)]) {
      const res = await reply({ text });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /conversations/:id (link customer)", () => {
  function link(body: Record<string, unknown>) {
    return request(app).patch("/conversations/cv1").set("Cookie", cookie).send(body);
  }

  it("links an active customer of the same shop", async () => {
    findCustomer.mockResolvedValue({ id: "c1" } as never);
    updateConversation.mockResolvedValue(conversationRow as never);

    const res = await link({ customerId: "c1" });

    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({ id: "cv1", customerId: "c1", title: "Chi Lan" });
    expect(findCustomer).toHaveBeenCalledWith({
      where: { id: "c1", shopId: "shop-1", isActive: true },
      select: { id: true },
    });
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cv1", shopId: "shop-1" },
        data: { customerId: "c1" },
      }),
    );
  });

  it("unlinks the customer when customerId is null, without looking up a customer", async () => {
    updateConversation.mockResolvedValue({
      ...conversationRow,
      customerId: null,
      customer: null,
    } as never);

    const res = await link({ customerId: null });

    expect(res.status).toBe(200);
    expect(res.body.conversation.customerId).toBeNull();
    expect(findCustomer).not.toHaveBeenCalled();
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { customerId: null } }),
    );
  });

  it("returns 404 and updates nothing when the customer is not in the shop", async () => {
    findCustomer.mockResolvedValue(null);

    const res = await link({ customerId: "c-other" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation is not in the shop", async () => {
    updateConversation.mockRejectedValue({ code: "P2025" });

    const res = await link({ customerId: null });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("rejects a body without customerId or with an empty one", async () => {
    for (const body of [{}, { customerId: "" }]) {
      const res = await link(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("POST /conversations/:id/customer (create customer from conversation)", () => {
  function create(body: Record<string, unknown>) {
    return request(app).post("/conversations/cv1/customer").set("Cookie", cookie).send(body);
  }

  function mockHappyPath() {
    tx.conversation.findFirst.mockResolvedValueOnce({ customerId: null }).mockResolvedValueOnce({
      ...conversationRow,
      customerId: "c-new",
      customer: { name: "Khach la" },
    });
    tx.customer.create.mockResolvedValue({ id: "c-new" });
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
  }

  it("creates the customer for the token's shop and links it to the conversation", async () => {
    mockHappyPath();

    const res = await create(validCustomer);

    expect(res.status).toBe(201);
    expect(res.body.conversation).toMatchObject({
      id: "cv1",
      customerId: "c-new",
      title: "Khach la",
    });
    expect(tx.customer.create).toHaveBeenCalledWith({
      data: { name: "Khach la", phone: "0901234567", address: "", note: "", shopId: "shop-1" },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "cv1", shopId: "shop-1", customerId: null },
      data: { customerId: "c-new" },
    });
  });

  it("ignores a shopId sent in the body", async () => {
    mockHappyPath();

    const res = await create({ ...validCustomer, shopId: "shop-evil" });

    expect(res.status).toBe(201);
    expect(tx.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: "shop-1" }),
    });
  });

  it("returns 404 and creates no customer when the conversation is not in the shop", async () => {
    tx.conversation.findFirst.mockResolvedValueOnce(null);

    const res = await create(validCustomer);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONVERSATION_NOT_FOUND");
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it("returns 409 and creates no customer when the conversation is already linked", async () => {
    tx.conversation.findFirst.mockResolvedValueOnce({ customerId: "c1" });

    const res = await create(validCustomer);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONVERSATION_ALREADY_LINKED");
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it("returns 409 when someone else links the conversation first", async () => {
    tx.conversation.findFirst.mockResolvedValueOnce({ customerId: null });
    tx.customer.create.mockResolvedValue({ id: "c-new" });
    tx.conversation.updateMany.mockResolvedValue({ count: 0 });

    const res = await create(validCustomer);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONVERSATION_ALREADY_LINKED");
  });

  it("rejects an invalid phone number or an empty name with 400", async () => {
    for (const body of [
      { ...validCustomer, phone: "12345" },
      { ...validCustomer, name: "   " },
    ]) {
      const res = await create(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(tx.customer.create).not.toHaveBeenCalled();
  });
});
