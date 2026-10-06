import {
  MAX_ORDER_TOTAL,
  computeOrderTotals,
  formatOrderCode,
  type OrderDto,
  type OrderInput,
  type OrderItemInput,
  type OrderListQuery,
  type OrderListResponse,
  type OrderStatus,
  type OrderUpdate,
} from "@chat2order/shared/order";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { prismaErrorCode } from "../lib/prisma-error.js";

type Db = Pick<typeof prisma, "customer" | "product" | "shop" | "order">;

const orderInclude = { items: { orderBy: { position: "asc" as const } } };

type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDate: Date | null;
  note: string;
  shippingFee: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    productId: string;
    sku: string;
    name: string;
    unit: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
};

function toDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    number: row.number,
    code: formatOrderCode(row.number),
    status: row.status,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deliveryAddress: row.deliveryAddress,
    deliveryDate: row.deliveryDate ? row.deliveryDate.toISOString().slice(0, 10) : null,
    note: row.note,
    shippingFee: row.shippingFee,
    subtotal: row.total - row.shippingFee,
    total: row.total,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseDeliveryDate(value: string): Date | null {
  return value === "" ? null : new Date(`${value}T00:00:00.000Z`);
}

function assertTotal(total: number) {
  if (total > MAX_ORDER_TOTAL) {
    throw new AppError(
      400,
      "Tổng tiền đơn hàng vượt quá giới hạn cho phép",
      "ORDER_TOTAL_TOO_LARGE",
    );
  }
}

async function loadCustomer(db: Db, shopId: string, customerId: string) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId, isActive: true },
  });
  if (!customer) {
    throw new AppError(404, "Không tìm thấy khách hàng", "CUSTOMER_NOT_FOUND");
  }
  return customer;
}

// Chụp lại tên, đơn vị và giá hiện tại của sản phẩm vào từng dòng hàng
async function buildItems(db: Db, shopId: string, items: OrderItemInput[]) {
  const ids = items.map((item) => item.productId);
  const products = await db.product.findMany({
    where: { id: { in: ids }, shopId, isActive: true },
  });
  if (products.length !== ids.length) {
    throw new AppError(
      400,
      "Có sản phẩm không tồn tại hoặc đã được lưu trữ",
      "PRODUCT_UNAVAILABLE",
    );
  }

  const byId = new Map(products.map((product) => [product.id, product]));

  return items.map((item, position) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new AppError(
        400,
        "Có sản phẩm không tồn tại hoặc đã được lưu trữ",
        "PRODUCT_UNAVAILABLE",
      );
    }
    return {
      productId: product.id,
      position,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      unitPrice: product.price,
      quantity: item.quantity,
      lineTotal: product.price * item.quantity,
    };
  });
}

export async function listOrders(
  shopId: string,
  query: OrderListQuery,
): Promise<OrderListResponse> {
  const codeMatch = query.q ? /^(?:dh)?(\d{1,9})$/i.exec(query.q) : null;

  const where = {
    shopId,
    ...(query.status === "all" ? {} : { status: query.status }),
    ...(query.q
      ? {
          OR: [
            { customerName: { contains: query.q, mode: "insensitive" as const } },
            ...(codeMatch ? [{ number: Number(codeMatch[1]) }] : []),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getOrder(shopId: string, id: string): Promise<OrderDto> {
  const row = await prisma.order.findFirst({ where: { id, shopId }, include: orderInclude });
  if (!row) {
    throw new AppError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
  }
  return toDto(row);
}

export async function createOrder(shopId: string, input: OrderInput): Promise<OrderDto> {
  const row = await prisma.$transaction(async (tx) => {
    const customer = await loadCustomer(tx, shopId, input.customerId);
    const items = await buildItems(tx, shopId, input.items);

    const { total } = computeOrderTotals(items, input.shippingFee);
    assertTotal(total);

    const { orderSeq } = await tx.shop.update({
      where: { id: shopId },
      data: { orderSeq: { increment: 1 } },
      select: { orderSeq: true },
    });

    return tx.order.create({
      data: {
        shopId,
        number: orderSeq,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        deliveryAddress: input.deliveryAddress || customer.address,
        deliveryDate: parseDeliveryDate(input.deliveryDate),
        note: input.note,
        shippingFee: input.shippingFee,
        total,
        items: { create: items },
      },
      include: orderInclude,
    });
  });

  return toDto(row);
}

export async function updateOrder(
  shopId: string,
  id: string,
  input: OrderUpdate,
): Promise<OrderDto> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({ where: { id, shopId }, include: orderInclude });
      if (!existing) {
        throw new AppError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
      }
      if (existing.status !== "PENDING") {
        throw new AppError(409, "Chỉ sửa được đơn đang chờ xác nhận", "ORDER_NOT_EDITABLE");
      }

      const customer =
        input.customerId && input.customerId !== existing.customerId
          ? await loadCustomer(tx, shopId, input.customerId)
          : null;
      const items = input.items ? await buildItems(tx, shopId, input.items) : null;

      const shippingFee = input.shippingFee ?? existing.shippingFee;
      const { total } = computeOrderTotals(items ?? existing.items, shippingFee);
      assertTotal(total);

      if (items) {
        await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
      }

      return tx.order.update({
        where: { id, shopId, status: "PENDING" },
        data: {
          ...(customer
            ? {
                customerId: customer.id,
                customerName: customer.name,
                customerPhone: customer.phone,
              }
            : {}),
          ...(input.deliveryAddress !== undefined
            ? { deliveryAddress: input.deliveryAddress }
            : customer
              ? { deliveryAddress: customer.address }
              : {}),
          ...(input.deliveryDate !== undefined
            ? { deliveryDate: parseDeliveryDate(input.deliveryDate) }
            : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          shippingFee,
          total,
          ...(items ? { items: { create: items } } : {}),
        },
        include: orderInclude,
      });
    });

    return toDto(row);
  } catch (err) {
    // P2025: đơn không còn ở trạng thái PENDING vào lúc ghi
    if (prismaErrorCode(err) === "P2025") {
      throw new AppError(
        409,
        "Đơn hàng vừa thay đổi trạng thái, vui lòng tải lại",
        "ORDER_NOT_EDITABLE",
      );
    }
    throw err;
  }
}
