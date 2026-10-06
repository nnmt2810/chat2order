import request from "supertest";
import { computeOrderTotals } from "@chat2order/shared/order";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    customer: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    shop: { update: vi.fn() },
    order: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    orderItem: { deleteMany: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    order: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

const findMany = vi.mocked(prisma.order.findMany);
const count = vi.mocked(prisma.order.count);
const findFirst = vi.mocked(prisma.order.findFirst);

const customer = {
  id: "c1",
  shopId: "shop-1",
  name: "Chi Lan",
  phone: "0901234567",
  address: "45 Le Loi",
  note: "",
  isActive: true,
};

const products = [
  {
    id: "p1",
    shopId: "shop-1",
    sku: "NS-500",
    name: "Nuoc suoi 500ml",
    unit: "thung",
    price: 95000,
  },
  { id: "p2", shopId: "shop-1", sku: "DUONG-1", name: "Duong 1kg", unit: "bao", price: 25000 },
];

const orderRow = {
  id: "o1",
  shopId: "shop-1",
  number: 1,
  status: "PENDING",
  customerId: "c1",
  customerName: "Chi Lan",
  customerPhone: "0901234567",
  deliveryAddress: "45 Le Loi",
  deliveryDate: new Date("2026-10-07T00:00:00Z"),
  note: "",
  shippingFee: 20000,
  total: 235000,
  createdAt: new Date("2026-10-06T00:00:00Z"),
  updatedAt: new Date("2026-10-06T00:00:00Z"),
  items: [
    {
      id: "i1",
      orderId: "o1",
      productId: "p1",
      position: 0,
      sku: "NS-500",
      name: "Nuoc suoi 500ml",
      unit: "thung",
      unitPrice: 95000,
      quantity: 2,
      lineTotal: 190000,
    },
    {
      id: "i2",
      orderId: "o1",
      productId: "p2",
      position: 1,
      sku: "DUONG-1",
      name: "Duong 1kg",
      unit: "bao",
      unitPrice: 25000,
      quantity: 1,
      lineTotal: 25000,
    },
  ],
};

const validBody = {
  customerId: "c1",
  deliveryAddress: "",
  deliveryDate: "2026-10-07",
  note: "",
  shippingFee: 20000,
  items: [
    { productId: "p1", quantity: 2 },
    { productId: "p2", quantity: 1 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("computeOrderTotals", () => {
  it("sums the lines and adds the shipping fee", () => {
    const result = computeOrderTotals(
      [
        { unitPrice: 95000, quantity: 2 },
        { unitPrice: 25000, quantity: 1 },
      ],
      20000,
    );
    expect(result).toEqual({ lineTotals: [190000, 25000], subtotal: 215000, total: 235000 });
  });
});

describe("auth", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/orders");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /orders", () => {
  it("only queries the shop from the token and applies no status filter by default", async () => {
    findMany.mockResolvedValue([orderRow] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/orders").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.items[0]).toMatchObject({ id: "o1", code: "DH00001", subtotal: 215000 });
    expect(res.body.items[0].shopId).toBeUndefined();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId: "shop-1" } }));
  });

  it("filters by status", async () => {
    findMany.mockResolvedValue([orderRow] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/orders?status=PENDING").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: "shop-1", status: "PENDING" }),
      }),
    );
  });

  it("finds an order by its code", async () => {
    findMany.mockResolvedValue([orderRow] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/orders?q=DH00001").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([{ number: 1 }]) }),
      }),
    );
  });

  it("rejects an unknown status with 400", async () => {
    const res = await request(app).get("/orders?status=bogus").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /orders/:id", () => {
  it("returns the order with its items", async () => {
    findFirst.mockResolvedValue(orderRow as never);

    const res = await request(app).get("/orders/o1").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.order.code).toBe("DH00001");
    expect(res.body.order.deliveryDate).toBe("2026-10-07");
    expect(res.body.order.items).toHaveLength(2);
    expect(res.body.order.shopId).toBeUndefined();
  });

  it("returns 404 for an order that is not in the shop", async () => {
    findFirst.mockResolvedValue(null);

    const res = await request(app).get("/orders/o-other").set("Cookie", cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o-other", shopId: "shop-1" } }),
    );
  });
});

describe("POST /orders", () => {
  function mockHappyPath() {
    tx.customer.findFirst.mockResolvedValue(customer);
    tx.product.findMany.mockResolvedValue(products);
    tx.shop.update.mockResolvedValue({ orderSeq: 1 });
    tx.order.create.mockResolvedValue(orderRow);
  }

  it("creates an order with server-side totals and price snapshots", async () => {
    mockHappyPath();

    const res = await request(app).post("/orders").set("Cookie", cookie).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.order.code).toBe("DH00001");
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", shopId: "shop-1", isActive: true },
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: "shop-1",
          number: 1,
          customerName: "Chi Lan",
          deliveryAddress: "45 Le Loi",
          shippingFee: 20000,
          total: 235000,
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({
                productId: "p1",
                name: "Nuoc suoi 500ml",
                unitPrice: 95000,
                quantity: 2,
                lineTotal: 190000,
              }),
            ]),
          },
        }),
      }),
    );
  });

  it("ignores a shopId or total sent in the body", async () => {
    mockHappyPath();

    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({ ...validBody, shopId: "shop-evil", total: 1 });

    expect(res.status).toBe(201);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop-1", total: 235000 }),
      }),
    );
  });

  it("returns 404 and writes nothing when the customer is not in the shop", async () => {
    tx.customer.findFirst.mockResolvedValue(null);

    const res = await request(app).post("/orders").set("Cookie", cookie).send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(tx.shop.update).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("returns 400 when a product is missing or archived", async () => {
    tx.customer.findFirst.mockResolvedValue(customer);
    tx.product.findMany.mockResolvedValue([products[0]]);

    const res = await request(app).post("/orders").set("Cookie", cookie).send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect(tx.shop.update).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("rejects a total above the limit", async () => {
    tx.customer.findFirst.mockResolvedValue(customer);
    tx.product.findMany.mockResolvedValue([{ ...products[0], price: 1_000_000_000 }]);

    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({ ...validBody, items: [{ productId: "p1", quantity: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ORDER_TOTAL_TOO_LARGE");
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("rejects an order without items", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({ ...validBody, items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects the same product twice", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({
        ...validBody,
        items: [
          { productId: "p1", quantity: 1 },
          { productId: "p1", quantity: 2 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a zero quantity", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({ ...validBody, items: [{ productId: "p1", quantity: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an impossible delivery date", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Cookie", cookie)
      .send({ ...validBody, deliveryDate: "2026-02-31" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /orders/:id", () => {
  it("rejects an empty body with 400", async () => {
    const res = await request(app).patch("/orders/o1").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the order is not in the shop", async () => {
    tx.order.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch("/orders/o-other")
      .set("Cookie", cookie)
      .send({ note: "moi" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    expect(tx.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o-other", shopId: "shop-1" } }),
    );
  });

  it("refuses to edit an order that is no longer pending", async () => {
    tx.order.findFirst.mockResolvedValue({ ...orderRow, status: "CONFIRMED" });

    const res = await request(app).patch("/orders/o1").set("Cookie", cookie).send({ note: "moi" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_NOT_EDITABLE");
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("updates only the given fields and guards on the pending status", async () => {
    tx.order.findFirst.mockResolvedValue(orderRow);
    tx.order.update.mockResolvedValue({ ...orderRow, note: "moi" });

    const res = await request(app).patch("/orders/o1").set("Cookie", cookie).send({ note: "moi" });

    expect(res.status).toBe(200);
    expect(res.body.order.note).toBe("moi");
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "o1", shopId: "shop-1", status: "PENDING" },
        data: expect.objectContaining({ note: "moi", shippingFee: 20000, total: 235000 }),
      }),
    );
  });

  it("replaces the items and recomputes the total", async () => {
    tx.order.findFirst.mockResolvedValue(orderRow);
    tx.product.findMany.mockResolvedValue([products[1]]);
    tx.order.update.mockResolvedValue(orderRow);

    const res = await request(app)
      .patch("/orders/o1")
      .set("Cookie", cookie)
      .send({ items: [{ productId: "p2", quantity: 4 }], shippingFee: 0 });

    expect(res.status).toBe(200);
    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: "o1" } });
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 100000, shippingFee: 0 }),
      }),
    );
  });

  it("returns 409 when the order changed status during the update", async () => {
    tx.order.findFirst.mockResolvedValue(orderRow);
    tx.order.update.mockRejectedValue({ code: "P2025" });

    const res = await request(app).patch("/orders/o1").set("Cookie", cookie).send({ note: "moi" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_NOT_EDITABLE");
  });
});
