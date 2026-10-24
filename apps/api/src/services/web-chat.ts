import type {
  MessageDirection,
  WebChatMessageDto,
  WebChatMessageInput,
  WebChatMessagesResponse,
  WebChatPollQuery,
  WebChatSendResponse,
} from "@chat2order/shared/conversation";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { ingestInboundMessage } from "./conversations.js";

type MessageRow = { id: string; direction: MessageDirection; text: string; createdAt: Date };

// Chỉ trả đúng bốn trường, không lộ tên nhân viên hay thông tin nội bộ
function toPublicDto(row: MessageRow): WebChatMessageDto {
  return {
    id: row.id,
    direction: row.direction,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findShopId(shopKey: string): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { webChatKey: shopKey },
    select: { id: true },
  });
  if (!shop) {
    throw new AppError(404, "Không tìm thấy cửa hàng", "SHOP_NOT_FOUND");
  }
  return shop.id;
}

export async function receiveWebChatMessage(
  input: WebChatMessageInput,
): Promise<WebChatSendResponse> {
  const shopId = await findShopId(input.shopKey);

  const { message, duplicate } = await ingestInboundMessage({
    shopId,
    channel: "WEB",
    externalId: input.visitorId,
    displayName: input.displayName ?? "",
    customerId: null,
    text: input.text,
    externalMessageId: input.messageId,
  });

  return {
    message: {
      id: message.id,
      direction: message.direction,
      text: message.text,
      createdAt: message.createdAt,
    },
    duplicate,
  };
}

export async function listWebChatMessages(
  query: WebChatPollQuery,
  visitorId: string,
): Promise<WebChatMessagesResponse> {
  const shopId = await findShopId(query.shopKey);

  const conversation = await prisma.conversation.findUnique({
    where: { shopId_channel_externalId: { shopId, channel: "WEB", externalId: visitorId } },
    select: { id: true },
  });
  // Khách chưa từng nhắn: không có gì để trả, đó là trạng thái bình thường
  if (!conversation) {
    return { items: [] };
  }

  if (query.after) {
    // Lấy các tin mới hơn tin widget đã có
    const rows = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      cursor: { id: query.after },
      skip: 1,
      take: query.limit,
    });
    return { items: rows.map(toPublicDto) };
  }

  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });
  return { items: rows.reverse().map(toPublicDto) };
}
