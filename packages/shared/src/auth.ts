import { z } from "zod";

export const registerSchema = z.object({
  shopName: z.string().trim().min(2, "Tên cửa hàng tối thiểu 2 ký tự").max(100),
  name: z.string().trim().min(2, "Tên tối thiểu 2 ký tự").max(100),
  email: z.email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu tối đa 72 ký tự"),
});

export const loginSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  shopId: string;
  shopName: string;
};
