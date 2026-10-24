import cors from "cors";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  webChatMessageSchema,
  webChatPollQuerySchema,
  webChatVisitorIdSchema,
} from "@chat2order/shared/conversation";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { listWebChatMessages, receiveWebChatMessage } from "../services/web-chat.js";

export const webChatRouter = Router();

// CORS riêng cho endpoint công khai: website nào cũng nhúng được widget, và không kèm cookie
webChatRouter.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Visitor-Id"],
    maxAge: 600,
  }),
);

function createLimiter(options: {
  limit: number;
  keyGenerator?: (req: express.Request) => string;
}) {
  return rateLimit({
    windowMs: 60_000,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    handler: (_req, _res, next) =>
      next(new AppError(429, "Bạn thao tác quá nhanh, vui lòng thử lại sau", "RATE_LIMITED")),
  });
}

const sendByIpLimiter = createLimiter({ limit: 30 });
const sendByVisitorLimiter = createLimiter({
  limit: 10,
  keyGenerator: (req) => String(req.body?.visitorId ?? "anonymous").slice(0, 64),
});
const pollByIpLimiter = createLimiter({ limit: 90 });

webChatRouter.post(
  "/",
  sendByIpLimiter,
  express.json({ limit: "8kb" }),
  sendByVisitorLimiter,
  async (req, res) => {
    const input = webChatMessageSchema.parse(req.body);
    const result = await receiveWebChatMessage(input);
    res.set("Cache-Control", "no-store");
    // 201 khi lưu tin mới, 200 khi đây là lần gửi lại của một tin đã lưu
    res.status(result.duplicate ? 200 : 201).json(result);
  },
);

webChatRouter.get("/messages", pollByIpLimiter, async (req, res) => {
  const query = webChatPollQuerySchema.parse(req.query);
  const visitorId = webChatVisitorIdSchema.parse(req.header("x-visitor-id"));
  res.set("Cache-Control", "no-store");
  res.json(await listWebChatMessages(query, visitorId));
});
