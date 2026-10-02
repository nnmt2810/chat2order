import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

export const TOKEN_COOKIE = "token";
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type AuthContext = {
  userId: string;
  shopId: string;
  role: "OWNER" | "STAFF";
};

const payloadSchema = z.object({
  sub: z.string(),
  shopId: z.string(),
  role: z.enum(["OWNER", "STAFF"]),
});

export function signToken(ctx: AuthContext): string {
  return jwt.sign({ shopId: ctx.shopId, role: ctx.role }, env.JWT_SECRET, {
    subject: ctx.userId,
    expiresIn: TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    const parsed = payloadSchema.safeParse(decoded);
    if (!parsed.success) return null;
    return { userId: parsed.data.sub, shopId: parsed.data.shopId, role: parsed.data.role };
  } catch {
    return null;
  }
}
