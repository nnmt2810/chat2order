import { z } from "zod";

function dedupeAliases(list: string[]): string[] {
  const seen = new Map<string, string>();
  for (const alias of list) {
    const key = alias.toLowerCase();
    if (!seen.has(key)) seen.set(key, alias);
  }
  return [...seen.values()];
}

export const productInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Vui lòng nhập mã sản phẩm")
    .max(40, "Mã sản phẩm tối đa 40 ký tự")
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "Mã chỉ gồm chữ, số và các ký tự . _ -"),
  name: z.string().trim().min(1, "Vui lòng nhập tên sản phẩm").max(200),
  unit: z.string().trim().min(1, "Vui lòng nhập đơn vị tính").max(30),
  price: z.number().int("Giá phải là số nguyên").min(0, "Giá không được âm").max(1_000_000_000),
  stock: z
    .number()
    .int("Tồn kho phải là số nguyên")
    .min(0, "Tồn kho không được âm")
    .max(10_000_000),
  aliases: z
    .array(z.string().trim().min(1, "Tên gọi khác không được để trống").max(100))
    .max(20, "Tối đa 20 tên gọi khác")
    .transform(dedupeAliases),
});

export const productUpdateSchema = productInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "Cần ít nhất một trường để cập nhật");

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  includeInactive: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export type ProductDto = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  aliases: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductListResponse = {
  items: ProductDto[];
  total: number;
  page: number;
  pageSize: number;
};