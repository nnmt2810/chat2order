"use client";

import { useEffect, useRef } from "react";
import { flattenMessagePages, useMessages } from "@/lib/conversations";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Hội thoại nhìn từ phía khách: tin khách gửi nằm bên phải, trả lời của cửa hàng nằm bên trái
export function SimulatorThread({ conversationId }: { conversationId: string }) {
  const messagesQuery = useMessages(conversationId);
  const messages = flattenMessagePages(messagesQuery.data?.pages);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastId]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="max-h-80 min-h-24 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
      >
        {messagesQuery.isPending && (
          <p className="text-sm text-muted-foreground">Đang tải tin nhắn...</p>
        )}

        {messagesQuery.error && !messagesQuery.data && (
          <p className="text-sm text-red-600">
            Không tải được tin nhắn: {messagesQuery.error.message}
          </p>
        )}

        {messages.map((message) => {
          const fromCustomer = message.direction === "INBOUND";
          return (
            <div
              key={message.id}
              className={cn("flex", fromCustomer ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  fromCustomer
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm border bg-card",
                )}
              >
                {!fromCustomer && (
                  <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Cửa hàng</p>
                )}
                <p className="whitespace-pre-wrap wrap-break-words">{message.text}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    fromCustomer ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {messagesQuery.hasNextPage && (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện các tin gần nhất. Mở hội thoại trong Hộp thư để xem đầy đủ.
        </p>
      )}
    </div>
  );
}
