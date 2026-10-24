import type { WebChatSettings } from "@chat2order/shared/conversation";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";

export async function getWebChatSettings(shopId: string): Promise<WebChatSettings> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { webChatKey: true },
  });
  if (!shop) {
    throw new AppError(404, "Không tìm thấy cửa hàng", "SHOP_NOT_FOUND");
  }
  return { webChatKey: shop.webChatKey };
}
