import type { IncomingMessage, Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { TOKEN_COOKIE, verifyToken, type AuthContext } from "./lib/token.js";

export const CONVERSATION_CHANGED = "conversation:changed";

let io: Server | null = null;

export function shopRoom(shopId: string): string {
  return `shop:${shopId}`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  // Đối tượng không có prototype để tên cookie như "__proto__" không gây hại
  const result: Record<string, string> = Object.create(null);
  if (!header) return result;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

function authenticate(cookieHeader: string | undefined): AuthContext | null {
  const token = parseCookies(cookieHeader)[TOKEN_COOKIE];
  return token ? verifyToken(token) : null;
}

// Trình duyệt luôn gửi Origin, công cụ không phải trình duyệt thì không.
// Đã có Origin thì phải đúng địa chỉ dashboard.
function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === undefined || origin === env.CORS_ORIGIN;
}

function allowRequest(
  req: IncomingMessage,
  callback: (err: string | null | undefined, success: boolean) => void,
) {
  if (!isAllowedOrigin(req.headers.origin)) {
    callback("Origin not allowed", false);
    return;
  }
  // Từ chối ngay ở bước bắt tay, trước khi máy chủ tạo phiên kết nối
  if (!authenticate(req.headers.cookie)) {
    callback("Unauthorized", false);
    return;
  }
  callback(null, true);
}

export function attachRealtime(httpServer: HttpServer): Server {
  const server = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    allowRequest,
    // Máy khách chỉ nhận sự kiện, không gửi dữ liệu lên
    maxHttpBufferSize: 1024,
  });

  // Phòng thủ nhiều lớp: kiểm tra lại token ở tầng Socket.IO
  server.use((socket, next) => {
    const auth = authenticate(socket.handshake.headers.cookie);
    if (!auth) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    socket.data.shopId = auth.shopId;
    next();
  });

  server.on("connection", (socket) => {
    // Phòng do máy chủ quyết định theo token, máy khách không có cách nào xin vào phòng khác
    void socket.join(shopRoom(socket.data.shopId as string));
  });

  io = server;
  return server;
}

// Chỉ báo "hội thoại này có thay đổi", không mang nội dung tin nhắn
export function emitConversationChanged(shopId: string, conversationId: string): void {
  if (!io) return;
  try {
    io.to(shopRoom(shopId)).emit(CONVERSATION_CHANGED, { conversationId });
  } catch (err) {
    logger.warn({ err }, "Failed to emit conversation event");
  }
}

// Đóng Socket.IO cũng đóng luôn máy chủ HTTP bên dưới
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  const current = io;
  io = null;
  await current.close();
}
