import request from "supertest";
import { canTransition, stockEffect } from "@chat2order/shared/order";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    order: { findFirst: vi.fn(), updateMany: vi.fn() },
    product: { updateMany: vi.fn() },
  },
}));

vi.mock("./lib/prisma.js", () => ({
  prisma: { $transaction: vi.fn() },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { signToken } from "./lib/token.js";

const app = createApp();
const cookie = `token=${signToken({ userId: "user-1", shopId: "shop-1", role: "OWNER" })}`;

// Xếp p2 trước p1 để kiểm tra việc sắp xếp theo productId
const items = [
  {
    id: "i2",
    orderId: "o1",
    productId: "p2",
    position: 0,
    sku: "DUONG-1",
    name: "Duong 1kg",
    unit: "bao",
    unitPrice: 25000,
    quantity: 1,
    lineTotal: 25000,
  },
  {
    id: "i1",
    orderId: "o1",
    productId: "p1",
    position: 1,
    sku: "NS-500",
    name: "Nuoc suoi 500ml",
    unit: "thung",
    unitPrice: 95000,
    quantity: 2,
    lineTotal: 190000,
  },
];

function makeOrder(status: string) {
  return {
    id: "o1",
    shopId: "shop-1",
    number: 1,
    status,
    customerId: "c1",
    customerName: "Chi Lan",
    customerPhone: "0901234567",
    deliveryAddress: "45 Le Loi",
    deliveryDate: null,
    note: "",
    shippingFee: 20000,
    total: 235000,
    createdAt: new Date("2026-10-06T00:00:00Z"),
    updatedAt: new Date("2026-10-06T00:00:00Z"),
    items,
  };
}

// Lần đọc đầu trả về đơn ở trạng thái cũ, lần đọc sau (cuối transaction) trả về trạng thái mới
function mockTransition(from: string, to: string) {
  tx.order.findFirst.mockResolvedValueOnce(makeOrder(from)).mockResolvedValueOnce(makeOrder(to));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.product.updateMany.mockResolvedValue({ count: 1 });
}

function changeStatus(status: string) {
  return request(app).patch("/orders/o1/status").set("Cookie", cookie).send({ status });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((
    fn: (client: typeof tx) => Promise<unknown>,
  ) => fn(tx)) as never);
});

describe("transition rules", () => {
  it("allows the normal lifecycle and cancelling before completion", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "SHIPPING")).toBe(true);
    expect(canTransition("SHIPPING", "COMPLETED")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(true);
  });

  it("forbids skipping steps, going backwards and leaving a final state", () => {
    expect(canTransition("PENDING", "SHIPPING")).toBe(false);
    expect(canTransition("SHIPPING", "CONFIRMED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "PENDING")).toBe(false);
  });

  it("deducts stock only on confirm and restores it only when cancelling a confirmed order", () => {
    expect(stockEffect("PENDING", "CONFIRMED")).toBe("deduct");
    expect(stockEffect("CONFIRMED", "CANCELLED")).toBe("restore");
    expect(stockEffect("SHIPPING", "CANCELLED")).toBe("restore");
    expect(stockEffect("PENDING", "CANCELLED")).toBe("none");
    expect(stockEffect("CONFIRMED", "SHIPPING")).toBe("none");
  });
});

describe("PATCH /orders/:id/status", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).patch("/orders/o1/status").send({ status: "CONFIRMED" });
    expect(res.status).toBe(401);
  });

  it("rejects PENDING and unknown targets with 400", async () => {
    for (const status of ["PENDING", "bogus"]) {
      const res = await changeStatus(status);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 404 when the order is not in the shop", async () => {
    tx.order.findFirst.mockResolvedValue(null);

    const res = await changeStatus("CONFIRMED");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
    expect(tx.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1", shopId: "shop-1" } }),
    );
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("confirms the order and deducts stock line by line, ordered by product id", async () => {
    mockTransition("PENDING", "CONFIRMED");

    const res = await changeStatus("CONFIRMED");

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CONFIRMED");
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", shopId: "shop-1", status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "p1", shopId: "shop-1", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "p2", shopId: "shop-1", stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
  });

  it("returns 409 when a product does not have enough stock", async () => {
    tx.order.findFirst.mockResolvedValueOnce(makeOrder("PENDING"));
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.product.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const res = await changeStatus("CONFIRMED");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(res.body.error.message).toContain("Duong 1kg");
  });

  it("returns 409 and leaves stock alone when another request already changed the status", async () => {
    tx.order.findFirst.mockResolvedValueOnce(makeOrder("PENDING"));
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const res = await changeStatus("CONFIRMED");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_STATUS_CHANGED");
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("cancels a pending order without touching stock", async () => {
    mockTransition("PENDING", "CANCELLED");

    const res = await changeStatus("CANCELLED");

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CANCELLED");
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("restores stock when cancelling a confirmed order", async () => {
    mockTransition("CONFIRMED", "CANCELLED");

    const res = await changeStatus("CANCELLED");

    expect(res.status).toBe(200);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "p1", shopId: "shop-1" },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "p2", shopId: "shop-1" },
      data: { stock: { increment: 1 } },
    });
  });

  it("restores stock when cancelling an order that is already shipping", async () => {
    mockTransition("SHIPPING", "CANCELLED");

    const res = await changeStatus("CANCELLED");

    expect(res.status).toBe(200);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
  });

  it("does not touch stock when moving to shipping or completed", async () => {
    mockTransition("CONFIRMED", "SHIPPING");
    expect((await changeStatus("SHIPPING")).status).toBe(200);

    mockTransition("SHIPPING", "COMPLETED");
    expect((await changeStatus("COMPLETED")).status).toBe(200);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to skip a step", async () => {
    tx.order.findFirst.mockResolvedValueOnce(makeOrder("PENDING"));

    const res = await changeStatus("SHIPPING");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to change an order in a final state", async () => {
    tx.order.findFirst.mockResolvedValueOnce(makeOrder("COMPLETED"));

    const res = await changeStatus("CANCELLED");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
