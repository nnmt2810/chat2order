import { z } from "zod";

export const orderStatuses = [
  "PENDING",
  "CONFIRMED",
  "SHIPPING",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

// Cột Int của Postgres là 32 bit nên tổng tiền phải nằm dưới ngưỡng này
export const MAX_ORDER_TOTAL = 2_000_000_000;

export function formatOrderCode(number: number): string {
  return `DH${String(number).padStart(5, "0")}`;
}

export function computeOrderTotals(
  lines: { unitPrice: number; quantity: number }[],
  shippingFee: number,
) {
  const lineTotals = lines.map((line) => line.unitPrice * line.quantity);
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  return { lineTotals, subtotal, total: subtotal + shippingFee };
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const deliveryDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isValidDateString(value),
    "Ngày giao không hợp lệ (định dạng YYYY-MM-DD)",
  );

export const orderItemInputSchema = z.object({
  productId: z.string().min(1, "Vui lòng chọn sản phẩm").max(100),
  quantity: z
    .number({ error: "Vui lòng nhập số lượng" })
    .int("Số lượng phải là số nguyên")
    .min(1, "Số lượng tối thiểu là 1")
    .max(10_000, "Số lượng tối đa là 10.000"),
});

export const orderInputSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng").max(100),
  deliveryAddress: z.string().trim().max(300, "Địa chỉ tối đa 300 ký tự"),
  deliveryDate: deliveryDateSchema,
  note: z.string().trim().max(1000, "Ghi chú tối đa 1000 ký tự"),
  shippingFee: z
    .number({ error: "Vui lòng nhập phí giao hàng" })
    .int("Phí giao hàng phải là số nguyên")
    .min(0, "Phí giao hàng không được âm")
    .max(100_000_000),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Đơn hàng cần ít nhất một sản phẩm")
    .max(50, "Tối đa 50 dòng sản phẩm")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Mỗi sản phẩm chỉ được xuất hiện một lần",
    ),
});

export const orderUpdateSchema = orderInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Cần ít nhất một trường để cập nhật");

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["all", "PENDING", "CONFIRMED", "SHIPPING", "COMPLETED", "CANCELLED"])
    .default("all"),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export type OrderItemDto = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type OrderDto = {
  id: string;
  number: number;
  code: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDate: string | null;
  note: string;
  shippingFee: number;
  subtotal: number;
  total: number;
  items: OrderItemDto[];
  createdAt: string;
  updatedAt: string;
};

export type OrderListResponse = {
  items: OrderDto[];
  total: number;
  page: number;
  pageSize: number;
};
