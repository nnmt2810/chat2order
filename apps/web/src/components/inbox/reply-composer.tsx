"use client";

import { useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@chat2order/shared/conversation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReplyToConversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

type ReplyComposerProps = {
  conversationId: string;
  hint: string;
  onSent: () => void;
};

export function ReplyComposer({ conversationId, hint, onSent }: ReplyComposerProps) {
  const reply = useReplyToConversation(conversationId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH;

  async function send() {
    if (reply.isPending) return;
    if (!trimmed) {
      setError("Vui lòng nhập nội dung tin nhắn");
      return;
    }
    if (tooLong) {
      setError(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
      return;
    }

    setError(null);
    try {
      await reply.mutateAsync(trimmed);
      setText("");
      onSent();
    } catch (err) {
      // Giữ nguyên nội dung trong ô soạn để người dùng thử gửi lại
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  }

  return (
    <div className="space-y-2 border-t p-3">
      <Textarea
        rows={3}
        value={text}
        placeholder="Nhập tin nhắn trả lời..."
        aria-label="Nội dung trả lời"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void send();
          }
        }}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="flex shrink-0 items-center gap-3">
          <span className={cn("text-xs", tooLong ? "text-red-600" : "text-muted-foreground")}>
            {trimmed.length}/{MAX_MESSAGE_LENGTH}
          </span>
          <Button type="button" size="sm" onClick={() => void send()} disabled={reply.isPending}>
            {reply.isPending ? "Đang gửi..." : "Gửi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
