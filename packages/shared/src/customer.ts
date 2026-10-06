import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.\-()]/g, "").replace(/^\+84/, "0"))
  .refine((value) => value === "" || /^0\d{9,10}$/.test(value), "Số điện thoại không hợp lệ");

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng").max(100),
  phone: phoneSchema,
  address: z.string().trim().max(300, "Địa chỉ tối đa 300 ký tự"),
  note: z.string().trim().max(1000, "Ghi chú tối đa 1000 ký tự"),
});

export const customerUpdateSchema = customerInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "Cần ít nhất một trường để cập nhật");

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "archived", "all"]).default("active"),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type CustomerDto = {
  id: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListResponse = {
  items: CustomerDto[];
  total: number;
  page: number;
  pageSize: number;
};
