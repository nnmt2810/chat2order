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
import type { CustomerInput } from "@chat2order/shared/customer";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { prismaErrorCode } from "../lib/prisma-error.js";

const PREVIEW_LENGTH = 100;

type ConversationRow = {
  id: string;
  channel: Channel;
  displayName: string;
  customerId: string | null;
  unreadCount: number;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastMessageDirection: MessageDirection;
  createdAt: Date;
  customer: { name: string } | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  createdAt: Date;
  author?: { name: string } | null;
};

const customerNameSelect = { customer: { select: { name: true } } };

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
    lastMessageDirection: row.lastMessageDirection,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    text: row.text,
    authorName: row.author?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function makePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH);
}

function conversationNotFound() {
  return new AppError(404, "Không tìm thấy hội thoại", "CONVERSATION_NOT_FOUND");
}

type IngestInput = {
  shopId: string;
  channel: Channel;
  externalId: string;
  displayName: string;
  customerId: string | null;
  text: string;
  // Mã tin nhắn do kênh cung cấp, dùng để chống gửi trùng khi kênh gửi lại cùng một tin
  externalMessageId?: string | null;
};

type IngestResult = {
  conversation: ConversationDto;
  message: MessageDto;
  duplicate: boolean;
};

// Cổng vào chung cho mọi kênh: Zalo, Messenger, web chat, giả lập đều gọi hàm này
export async function ingestInboundMessage(input: IngestInput): Promise<IngestResult> {
  const { shopId, channel, externalId, displayName, customerId, text } = input;
  const externalMessageId = input.externalMessageId ?? null;
  const now = new Date();
  const preview = makePreview(text);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
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
            lastMessageDirection: "INBOUND",
          },
          update: {
            unreadCount: { increment: 1 },
            lastMessageAt: now,
            lastMessagePreview: preview,
            lastMessageDirection: "INBOUND",
            ...(displayName ? { displayName } : {}),
            ...(customerId ? { customerId } : {}),
          },
          include: customerNameSelect,
        });

        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            direction: "INBOUND",
            text,
            ...(externalMessageId ? { externalId: externalMessageId } : {}),
          },
        });

        return { conversation, message };
      });

      return {
        conversation: toConversationDto(result.conversation),
        message: toMessageDto(result.message),
        duplicate: false,
      };
    } catch (err) {
      if (prismaErrorCode(err) !== "P2002") throw err;

      // Vi phạm ràng buộc unique: hoặc tin này đã được lưu từ lần gửi trước (gửi trùng)...
      if (externalMessageId) {
        const existing = await prisma.message.findFirst({
          where: { externalId: externalMessageId, conversation: { shopId, channel, externalId } },
          include: { conversation: { include: customerNameSelect } },
        });
        if (existing) {
          return {
            conversation: toConversationDto(existing.conversation),
            message: toMessageDto(existing),
            duplicate: true,
          };
        }
      }
      // ...hoặc hai tin đầu tiên của một khách mới đến cùng lúc, tranh nhau tạo hội thoại: thử lại một lần
    }
  }

  throw new AppError(409, "Không thể xử lý tin nhắn lúc này, vui lòng thử lại", "MESSAGE_CONFLICT");
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
      include: customerNameSelect,
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
    include: customerNameSelect,
  });
  if (!row) {
    throw conversationNotFound();
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
    throw conversationNotFound();
  }

  // Lấy mới nhất trước, thừa một tin để biết còn tin cũ hơn hay không
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { author: { select: { name: true } } },
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
    throw conversationNotFound();
  }
}

// Chủ shop trả lời: lưu tin OUTBOUND, đánh dấu đã đọc, cập nhật xem trước của hội thoại
export async function replyToConversation(
  shopId: string,
  userId: string,
  conversationId: string,
  text: string,
): Promise<MessageDto> {
  const now = new Date();

  const row = await prisma.$transaction(async (tx) => {
    // Cập nhật hội thoại trước: không khớp cửa hàng thì dừng ngay, chưa tạo tin nhắn nào
    const claimed = await tx.conversation.updateMany({
      where: { id: conversationId, shopId },
      data: {
        lastMessageAt: now,
        lastMessagePreview: makePreview(text),
        lastMessageDirection: "OUTBOUND",
        unreadCount: 0,
      },
    });
    if (claimed.count === 0) {
      throw conversationNotFound();
    }

    return tx.message.create({
      data: { conversationId, direction: "OUTBOUND", text, authorId: userId },
      include: { author: { select: { name: true } } },
    });
  });

  return toMessageDto(row);
}

// customerId = null để gỡ liên kết
export async function linkConversationCustomer(
  shopId: string,
  conversationId: string,
  customerId: string | null,
): Promise<ConversationDto> {
  if (customerId !== null) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, shopId, isActive: true },
      select: { id: true },
    });
    if (!customer) {
      throw new AppError(404, "Không tìm thấy khách hàng", "CUSTOMER_NOT_FOUND");
    }
  }

  try {
    const row = await prisma.conversation.update({
      where: { id: conversationId, shopId },
      data: { customerId },
      include: customerNameSelect,
    });
    return toConversationDto(row);
  } catch (err) {
    if (prismaErrorCode(err) === "P2025") {
      throw conversationNotFound();
    }
    throw err;
  }
}

function alreadyLinked() {
  return new AppError(
    409,
    "Hội thoại này đã liên kết với một khách hàng",
    "CONVERSATION_ALREADY_LINKED",
  );
}

// Tạo hồ sơ khách mới và liên kết với hội thoại, hoặc cả hai cùng xảy ra, hoặc không có gì
export async function createCustomerFromConversation(
  shopId: string,
  conversationId: string,
  input: CustomerInput,
): Promise<ConversationDto> {
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: { id: conversationId, shopId },
      select: { customerId: true },
    });
    if (!existing) {
      throw conversationNotFound();
    }
    if (existing.customerId) {
      throw alreadyLinked();
    }

    const customer = await tx.customer.create({ data: { ...input, shopId } });

    // Chỉ liên kết nếu hội thoại vẫn chưa có khách. Nếu có người khác vừa liên kết thì hoàn lại cả khách vừa tạo
    const claimed = await tx.conversation.updateMany({
      where: { id: conversationId, shopId, customerId: null },
      data: { customerId: customer.id },
    });
    if (claimed.count === 0) {
      throw alreadyLinked();
    }

    return tx.conversation.findFirst({
      where: { id: conversationId, shopId },
      include: customerNameSelect,
    });
  });

  if (!row) {
    throw conversationNotFound();
  }
  return toConversationDto(row);
}
