import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    product: {
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

const findMany = vi.mocked(prisma.product.findMany);
const count = vi.mocked(prisma.product.count);
const findFirst = vi.mocked(prisma.product.findFirst);
const create = vi.mocked(prisma.product.create);
const update = vi.mocked(prisma.product.update);

const row = {
  id: "p1",
  shopId: "shop-1",
  sku: "NS-500",
  name: "Nuoc suoi 500ml",
  unit: "thung",
  price: 95000,
  stock: 40,
  aliases: ["nuoc suoi nho"],
  isActive: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const validBody = {
  sku: "ns-500",
  name: "Nuoc suoi 500ml",
  unit: "thung",
  price: 95000,
  stock: 40,
  aliases: ["nuoc suoi nho"],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/products");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /products", () => {
  it("only queries the shop from the token and hides archived products", async () => {
    findMany.mockResolvedValue([row] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/products?q=nuoc").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.items[0]).toMatchObject({ id: "p1", sku: "NS-500", price: 95000 });
    expect(res.body.items[0].shopId).toBeUndefined();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", isActive: true }),
      }),
    );
  });
});

describe("POST /products", () => {
  it("creates a product for the token's shop and ignores a shopId in the body", async () => {
    create.mockResolvedValue(row as never);

    const res = await request(app)
      .post("/products")
      .set("Cookie", cookie)
      .send({ ...validBody, shopId: "shop-evil" });

    expect(res.status).toBe(201);
    expect(res.body.product.sku).toBe("NS-500");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: "shop-1", sku: "NS-500" }),
    });
  });

  it("rejects a negative price with 400", async () => {
    const res = await request(app)
      .post("/products")
      .set("Cookie", cookie)
      .send({ ...validBody, price: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the sku already exists in the shop", async () => {
    create.mockRejectedValue({ code: "P2002" });
    const res = await request(app).post("/products").set("Cookie", cookie).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SKU_TAKEN");
  });
});

describe("GET /products/:id", () => {
  it("returns 404 for a product that is not in the shop", async () => {
    findFirst.mockResolvedValue(null);
    const res = await request(app).get("/products/p-other").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "p-other", shopId: "shop-1" } });
  });
});

describe("PATCH /products/:id", () => {
  it("rejects an empty body with 400", async () => {
    const res = await request(app).patch("/products/p1").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the product does not exist in the shop", async () => {
    update.mockRejectedValue({ code: "P2025" });
    const res = await request(app)
      .patch("/products/p-other")
      .set("Cookie", cookie)
      .send({ price: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("DELETE /products/:id", () => {
  it("archives the product instead of deleting it", async () => {
    update.mockResolvedValue({ ...row, isActive: false } as never);
    const res = await request(app).delete("/products/p1").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(update).toHaveBeenCalledWith({
      where: { id: "p1", shopId: "shop-1" },
      data: { isActive: false },
    });
  });
});
