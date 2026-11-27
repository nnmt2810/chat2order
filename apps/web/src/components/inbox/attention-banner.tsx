"use client";

import { useState } from "react";
import { routingReasonLabels, type RoutingReason } from "@chat2order/shared/conversation";
import { Button } from "@/components/ui/button";
import { useConversationAnalyses, useResolveConversation } from "@/lib/conversations";

export function AttentionBanner({ conversationId }: { conversationId: string }) {
  const { data } = useConversationAnalyses(conversationId);
  const resolve = useResolveConversation(conversationId);
  const [error, setError] = useState<string | null>(null);

  // Cờ chỉ bật mà không tự tắt, nên gom lý do từ mọi bản phân tích gần đây từng yêu cầu người xem
  const reasons = new Set<RoutingReason>();
  for (const item of data?.items ?? []) {
    if (!item.needsHuman) continue;
    for (const reason of item.reasons) reasons.add(reason);
  }

  async function markResolved() {
    setError(null);
    try {
      await resolve.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  }

  return (
    <div
      aria-label="Cảnh báo cần người xem"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="min-w-0">
        <span className="font-semibold">Cần người xem. </span>
        {reasons.size > 0
          ? `${[...reasons].map((reason) => routingReasonLabels[reason]).join(", ")}.`
          : "AI đã đánh dấu hội thoại này cần người xem."}
        <span className="block text-xs opacity-80">Trả lời khách cũng sẽ tự tắt cảnh báo này.</span>
        {error && (
          <span role="alert" className="block text-xs text-red-700 dark:text-red-300">
            {error}
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void markResolved()}
        disabled={resolve.isPending}
      >
        {resolve.isPending ? "Đang lưu..." : "Đã xử lý"}
      </Button>
    </div>
  );
}
