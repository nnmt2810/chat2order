import { z } from "zod";

export const channels = ["WEB", "ZALO", "MESSENGER", "SIMULATOR"] as const;
export type Channel = (typeof channels)[number];

export const channelLabels: Record<Channel, string> = {
  WEB: "Website",
  ZALO: "Zalo",
  MESSENGER: "Messenger",
  SIMULATOR: "Giả lập",
};

export type MessageDirection = "INBOUND" | "OUTBOUND";

export const MAX_MESSAGE_LENGTH = 2000;

export const messageTextSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập nội dung tin nhắn")
  .max(MAX_MESSAGE_LENGTH, `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự`);

// Giả lập khách nhắn: chọn khách hàng có sẵn, hoặc dùng mã khách lạ (chưa có hồ sơ)
export const simulatedMessageSchema = z
  .object({
    customerId: z.string().min(1).max(100).optional(),
    visitorId: z.string().trim().min(1).max(64).optional(),
    visitorName: z.string().trim().max(100).optional(),
    text: messageTextSchema,
  })
  .refine(
    (value) => Boolean(value.customerId) !== Boolean(value.visitorId),
    "Chọn một khách hàng hoặc nhập mã khách lạ (không dùng cả hai)",
  );

export const conversationListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unread: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().min(1).max(100).optional(),
});

export type SimulatedMessageInput = z.infer<typeof simulatedMessageSchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;

export type ConversationDto = {
  id: string;
  channel: Channel;
  title: string;
  displayName: string;
  customerId: string | null;
  customerName: string | null;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  createdAt: string;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  createdAt: string;
};

export type ConversationListResponse = {
  items: ConversationDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type MessageListResponse = {
  items: MessageDto[];
  hasMore: boolean;
};
