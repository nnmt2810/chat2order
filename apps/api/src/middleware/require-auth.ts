import type { RequestHandler, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { TOKEN_COOKIE, verifyToken, type AuthContext } from "../lib/token.js";

export const requireAuth: RequestHandler = (req, res, next) => {
  const token: unknown = req.cookies?.[TOKEN_COOKIE];
  const ctx = typeof token === "string" ? verifyToken(token) : null;

  if (!ctx) {
    next(new AppError(401, "Cần đăng nhập", "UNAUTHORIZED"));
    return;
  }

  res.locals.auth = ctx;
  next();
};

export function getAuth(res: Response): AuthContext {
  return res.locals.auth as AuthContext;
}
