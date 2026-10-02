import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, registerSchema } from "@chat2order/shared/auth";
import type { AuthUser } from "@chat2order/shared/auth";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { TOKEN_COOKIE, TOKEN_TTL_SECONDS, signToken } from "../lib/token.js";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { getAuthUser, login, registerOwner } from "../services/auth.js";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
};

// Giới hạn chặt cho đăng ký/đăng nhập để chống dò mật khẩu
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, _res, next) =>
    next(new AppError(429, "Thử quá nhiều lần, vui lòng đợi rồi thử lại", "RATE_LIMITED")),
});

function startSession(res: Response, user: AuthUser) {
  const token = signToken({ userId: user.id, shopId: user.shopId, role: user.role });
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

authRouter.post("/register", authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerOwner(input);
  startSession(res, user);
  res.status(201).json({ user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await login(input);
  startSession(res, user);
  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (_req, res) => {
  const { userId } = getAuth(res);
  const user = await getAuthUser(userId);
  if (!user) {
    throw new AppError(401, "Cần đăng nhập", "UNAUTHORIZED");
  }
  res.json({ user });
});
