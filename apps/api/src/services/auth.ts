import bcrypt from "bcryptjs";
import type { AuthUser, LoginInput, RegisterInput } from "@chat2order/shared/auth";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";

// Chi phí băm thấp khi chạy test
const BCRYPT_COST = env.NODE_ENV === "test" ? 4 : 12;
// Vẫn tốn thời gian băm khi email không tồn tại, tránh lộ email nào đã đăng ký
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

type UserWithShop = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  shopId: string;
  shop: { name: string };
};

function toAuthUser(user: UserWithShop): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    shopId: user.shopId,
    shopName: user.shop.name,
  };
}

export async function registerOwner(input: RegisterInput): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: "OWNER",
        shop: { create: { name: input.shopName } },
      },
      include: { shop: true },
    });
    return toAuthUser(user);
  } catch (err) {
    // Email đã tồn tại, Prisma sẽ ném lỗi P2002
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      throw new AppError(409, "Email đã được sử dụng", "EMAIL_TAKEN");
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { shop: true },
  });

  const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new AppError(401, "Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
  }
  return toAuthUser(user);
}

export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { shop: true },
  });
  return user ? toAuthUser(user) : null;
}
