import type {
  Channel,
  ConversationDto,
  ConversationListQuery,
  ConversationListResponse,
  MessageDirection,
  MessageDto,
  MessageListQuery,
  MessageListResponse,
  SimulatedMessageInput,
} from "@chat2order/shared/conversation";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";

const PREVIEW_LENGTH = 100;

type ConversationRow = {
  id: string;
  channel: Channel;
  displayName: string;
  customerId: string | null;
  unreadCount: number;
  lastMessageAt: Date;
  lastMessagePreview: string;
  createdAt: Date;
  customer: { name: string } | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  createdAt: Date;
};

function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    channel: row.channel,
    title: row.customer?.name || row.displayName || "Khách ẩn danh",
    displayName: row.displayName,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

function makePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH);
}

type IngestInput = {
  shopId: string;
  channel: Channel;
  externalId: string;
  displayName: string;
  customerId: string | null;
  text: string;
};

// Cổng vào chung cho mọi kênh: Zalo, Messenger, web chat, giả lập đều gọi hàm này
export async function ingestInboundMessage(
  input: IngestInput,
): Promise<{ conversation: ConversationDto; message: MessageDto }> {
  const { shopId, channel, externalId, displayName, customerId, text } = input;
  const now = new Date();
  const preview = makePreview(text);

  const result = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: { shopId_channel_externalId: { shopId, channel, externalId } },
      create: {
        shopId,
        channel,
        externalId,
        displayName,
        customerId,
        unreadCount: 1,
        lastMessageAt: now,
        lastMessagePreview: preview,
      },
      update: {
        unreadCount: { increment: 1 },
        lastMessageAt: now,
        lastMessagePreview: preview,
        ...(displayName ? { displayName } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: { customer: { select: { name: true } } },
    });

    const message = await tx.message.create({
      data: { conversationId: conversation.id, direction: "INBOUND", text },
    });

    return { conversation, message };
  });

  return {
    conversation: toConversationDto(result.conversation),
    message: toMessageDto(result.message),
  };
}

export async function simulateInboundMessage(shopId: string, input: SimulatedMessageInput) {
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, shopId, isActive: true },
    });
    if (!customer) {
      throw new AppError(404, "Không tìm thấy khách hàng", "CUSTOMER_NOT_FOUND");
    }
    return ingestInboundMessage({
      shopId,
      channel: "SIMULATOR",
      externalId: `customer:${customer.id}`,
      displayName: customer.name,
      customerId: customer.id,
      text: input.text,
    });
  }

  if (!input.visitorId) {
    throw new AppError(400, "Thiếu khách hàng hoặc mã khách lạ", "VALIDATION_ERROR");
  }
  return ingestInboundMessage({
    shopId,
    channel: "SIMULATOR",
    externalId: `visitor:${input.visitorId}`,
    displayName: input.visitorName ?? "",
    customerId: null,
    text: input.text,
  });
}

export async function listConversations(
  shopId: string,
  query: ConversationListQuery,
): Promise<ConversationListResponse> {
  const where = {
    shopId,
    ...(query.unread ? { unreadCount: { gt: 0 } } : {}),
    ...(query.q
      ? {
          OR: [
            { displayName: { contains: query.q, mode: "insensitive" as const } },
            { customer: { is: { name: { contains: query.q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { items: rows.map(toConversationDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getConversation(shopId: string, id: string): Promise<ConversationDto> {
  const row = await prisma.conversation.findFirst({
    where: { id, shopId },
    include: { customer: { select: { name: true } } },
  });
  if (!row) {
    throw new AppError(404, "Không tìm thấy hội thoại", "CONVERSATION_NOT_FOUND");
  }
  return toConversationDto(row);
}

export async function listMessages(
  shopId: string,
  conversationId: string,
  query: MessageListQuery,
): Promise<MessageListResponse> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: { id: true },
  });
  if (!conversation) {
    throw new AppError(404, "Không tìm thấy hội thoại", "CONVERSATION_NOT_FOUND");
  }

  // Lấy mới nhất trước, thừa một tin để biết còn tin cũ hơn hay không
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
  });

  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).reverse().map(toMessageDto);
  return { items, hasMore };
}

export async function markConversationRead(shopId: string, id: string): Promise<void> {
  const result = await prisma.conversation.updateMany({
    where: { id, shopId },
    data: { unreadCount: 0 },
  });
  if (result.count === 0) {
    throw new AppError(404, "Không tìm thấy hội thoại", "CONVERSATION_NOT_FOUND");
  }
}
