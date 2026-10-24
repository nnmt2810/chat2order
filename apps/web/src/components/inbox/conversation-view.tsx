"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { channelLabels, type MessageDto } from "@chat2order/shared/conversation";
import { CustomerLinkCard } from "@/components/inbox/customer-link-card";
import { ReplyComposer } from "@/components/inbox/reply-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import {
  flattenMessagePages,
  latestInboundId,
  useConversation,
  useMarkConversationRead,
  useMessages,
} from "@/lib/conversations";
import { dayKey, formatDay, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STICK_THRESHOLD_PX = 80;

function MessageBubble({ message }: { message: MessageDto }) {
  const inbound = message.direction === "INBOUND";
  return (
    <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
          inbound ? "rounded-bl-sm bg-muted" : "rounded-br-sm bg-primary text-primary-foreground",
        )}
      >
        {!inbound && (
          <p className="mb-0.5 text-[10px] font-medium text-primary-foreground/80">
            {message.authorName ?? "Cửa hàng"}
          </p>
        )}
        <p className="whitespace-pre-wrap wrap-break-words">{message.text}</p>
        <p
          className={cn(
            "mt-1 text-[10px]",
            inbound ? "text-muted-foreground" : "text-primary-foreground/70",
          )}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function ConversationView({ id }: { id: string }) {
  const {
    data: conversation,
    error: conversationError,
    isPending: conversationPending,
  } = useConversation(id);
  const messagesQuery = useMessages(id);
  const { mutate: markRead } = useMarkConversationRead(id);
  const [infoOpen, setInfoOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = flattenMessagePages(messagesQuery.data?.pages);
  const lastMessageId = messages[messages.length - 1]?.id;
  const inboundId = latestInboundId(messages);

  // Mở hội thoại, hoặc có tin khách mới trong lúc đang xem, thì đánh dấu đã đọc
  useEffect(() => {
    if (inboundId) markRead();
  }, [inboundId, markRead]);

  // Chỉ tự cuộn xuống khi người dùng đang ở gần cuối
  useEffect(() => {
    const element = containerRef.current;
    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lastMessageId]);

  function onScroll() {
    const element = containerRef.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX;
  }

  if (conversationError instanceof ApiError && conversationError.status === 404) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-center">
        <p className="text-muted-foreground">Không tìm thấy hội thoại này.</p>
        <Link href="/inbox" className="text-sm underline underline-offset-4">
          Về hộp thư
        </Link>
      </div>
    );
  }

  const replyHint =
    conversation?.channel === "SIMULATOR"
      ? "Ctrl + Enter để gửi. Khách giả lập thấy tin này ở trang Giả lập khách."
      : "Ctrl + Enter để gửi. Tin được lưu trong hệ thống, chưa gửi ra kênh bên ngoài.";

  return (
    <div className="flex h-full gap-4">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">
              {conversationPending ? "Đang tải..." : (conversation?.title ?? "Hội thoại")}
            </h2>
            {conversation && (
              <p className="truncate text-xs text-muted-foreground">
                {conversation.customerName
                  ? "Đã có hồ sơ khách hàng"
                  : "Chưa liên kết hồ sơ khách hàng"}
              </p>
            )}
          </div>
          {conversation && (
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline">{channelLabels[conversation.channel]}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="xl:hidden"
                onClick={() => setInfoOpen(true)}
              >
                <UserRound className="h-4 w-4" />
                Khách hàng
              </Button>
            </div>
          )}
        </div>

        <div
          ref={containerRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
        >
          {messagesQuery.isPending && (
            <p className="text-sm text-muted-foreground">Đang tải tin nhắn...</p>
          )}

          {messagesQuery.error && !messagesQuery.data && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">
                Không tải được tin nhắn: {messagesQuery.error.message}
              </p>
              <Button variant="outline" size="sm" onClick={() => messagesQuery.refetch()}>
                Thử lại
              </Button>
            </div>
          )}

          {messagesQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => messagesQuery.fetchNextPage()}
                disabled={messagesQuery.isFetchingNextPage}
              >
                {messagesQuery.isFetchingNextPage ? "Đang tải..." : "Xem tin cũ hơn"}
              </Button>
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
            return (
              <div key={message.id} className="space-y-2">
                {newDay && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {formatDay(message.createdAt)}
                  </p>
                )}
                <MessageBubble message={message} />
              </div>
            );
          })}

          {messagesQuery.data && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Hội thoại chưa có tin nhắn.</p>
          )}
        </div>

        {conversation && (
          <ReplyComposer
            conversationId={id}
            hint={replyHint}
            onSent={() => {
              // Vừa gửi tin thì luôn cuộn xuống để thấy tin của mình
              stickToBottom.current = true;
            }}
          />
        )}
      </div>

      <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Đơn hàng đề xuất</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Khi tích hợp AI, đơn hàng được trích xuất từ tin nhắn của khách sẽ hiện ở đây để bạn
            duyệt và sửa trước khi gửi xác nhận.
          </CardContent>
        </Card>

        {conversation && <CustomerLinkCard conversation={conversation} />}
      </aside>

      {conversation && (
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Khách hàng</DialogTitle>
              <DialogDescription>Hồ sơ khách hàng gắn với hội thoại này.</DialogDescription>
            </DialogHeader>
            <CustomerLinkCard conversation={conversation} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
