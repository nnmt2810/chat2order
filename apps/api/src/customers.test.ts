import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

const findMany = vi.mocked(prisma.customer.findMany);
const count = vi.mocked(prisma.customer.count);
const findFirst = vi.mocked(prisma.customer.findFirst);
const create = vi.mocked(prisma.customer.create);
const update = vi.mocked(prisma.customer.update);

const row = {
  id: "c1",
  shopId: "shop-1",
  name: "Chi Lan",
  phone: "0901234567",
  address: "45 Le Loi",
  note: "Hay dat nhu cu",
  isActive: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const validBody = {
  name: "Chi Lan",
  phone: "0901234567",
  address: "45 Le Loi",
  note: "Hay dat nhu cu",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/customers");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /customers", () => {
  it("only queries the shop from the token and hides archived customers", async () => {
    findMany.mockResolvedValue([row] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/customers?q=lan").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.items[0]).toMatchObject({ id: "c1", name: "Chi Lan", phone: "0901234567" });
    expect(res.body.items[0].shopId).toBeUndefined();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", isActive: true }),
      }),
    );
  });

  it("returns only archived customers when status=archived", async () => {
    findMany.mockResolvedValue([{ ...row, isActive: false }] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/customers?status=archived").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", isActive: false }),
      }),
    );
  });

  it("does not filter by isActive when status=all", async () => {
    findMany.mockResolvedValue([row] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/customers?status=all").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId: "shop-1" } }));
  });

  it("rejects an unknown status with 400", async () => {
    const res = await request(app).get("/customers?status=bogus").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /customers", () => {
  it("creates a customer for the token's shop and ignores a shopId in the body", async () => {
    create.mockResolvedValue(row as never);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send({ ...validBody, shopId: "shop-evil" });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe("Chi Lan");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: "shop-1", name: "Chi Lan" }),
    });
  });

  it("normalizes the phone number before saving", async () => {
    create.mockResolvedValue(row as never);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send({ ...validBody, phone: "+84 901 234 567" });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: "0901234567" }),
    });
  });

  it("accepts an empty phone number", async () => {
    create.mockResolvedValue({ ...row, phone: "" } as never);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send({ ...validBody, phone: "" });

    expect(res.status).toBe(201);
  });

  it("rejects an invalid phone number with 400", async () => {
    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send({ ...validBody, phone: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty name with 400", async () => {
    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send({ ...validBody, name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /customers/:id", () => {
  it("returns 404 for a customer that is not in the shop", async () => {
    findFirst.mockResolvedValue(null);
    const res = await request(app).get("/customers/c-other").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "c-other", shopId: "shop-1" } });
  });
});

describe("PATCH /customers/:id", () => {
  it("rejects an empty body with 400", async () => {
    const res = await request(app).patch("/customers/c1").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("clears a field when an empty string is sent", async () => {
    update.mockResolvedValue({ ...row, note: "" } as never);

    const res = await request(app).patch("/customers/c1").set("Cookie", cookie).send({ note: "" });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1", shopId: "shop-1" },
      data: { note: "" },
    });
  });

  it("returns 404 when the customer does not exist in the shop", async () => {
    update.mockRejectedValue({ code: "P2025" });
    const res = await request(app)
      .patch("/customers/c-other")
      .set("Cookie", cookie)
      .send({ name: "Moi" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });
});

describe("DELETE /customers/:id", () => {
  it("archives the customer instead of deleting it", async () => {
    update.mockResolvedValue({ ...row, isActive: false } as never);
    const res = await request(app).delete("/customers/c1").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1", shopId: "shop-1" },
      data: { isActive: false },
    });
  });
});
