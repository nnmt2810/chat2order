"use client";

import { routingReasonLabels, type ConversationAnalysisDto } from "@chat2order/shared/conversation";
import { IntentBadge } from "@/components/inbox/intent-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { intentLabels } from "@chat2order/shared/conversation";
import { useConversationAnalyses } from "@/lib/conversations";
import { formatDateTime } from "@/lib/format";

const errorLabels: Record<string, string> = {
  PROVIDER_ERROR: "Nhà cung cấp AI từ chối yêu cầu. Kiểm tra khóa API và tên model.",
  INVALID_OUTPUT: "AI trả về dữ liệu không đúng cấu trúc.",
  NOT_CONFIGURED: "AI chưa được cấu hình đầy đủ.",
};

function LatestAnalysis({ analysis }: { analysis: ConversationAnalysisDto }) {
  if (analysis.status === "FAILED") {
    return (
      <div className="space-y-1">
        <p className="font-medium text-red-700 dark:text-red-300">AI không phân tích được</p>
        <p className="text-muted-foreground">
          {errorLabels[analysis.errorCode ?? ""] ?? "Đã xảy ra lỗi khi gọi AI."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {analysis.intents.length === 0 ? (
        <p className="text-muted-foreground">AI không nhận ra ý định nào.</p>
      ) : (
        <ul className="space-y-2">
          {analysis.intents.map((intent) => {
            const percent = Math.round(intent.confidence * 100);
            return (
              <li key={intent.type} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <IntentBadge type={intent.type} />
                    {intent.topic && (
                      <span className="truncate text-xs text-muted-foreground">{intent.topic}</span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-muted"
                  role="img"
                  aria-label={`Độ tin cậy ${percent}%`}
                >
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {analysis.needsHuman ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <div className="font-medium">Cần người xem</div>
          <ul className="list-disc pl-4">
            {analysis.reasons.map((reason) => (
              <li key={reason}>{routingReasonLabels[reason]}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Không có dấu hiệu cần người xem.</p>
      )}
    </div>
  );
}

export function AnalysisCard({ conversationId }: { conversationId: string }) {
  const { data, error, isPending, refetch } = useConversationAnalyses(conversationId);
  const [latest, ...older] = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Phân tích AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isPending && <p className="text-muted-foreground">Đang tải...</p>}

        {error && !data && (
          <div className="space-y-2">
            <p className="text-red-600">Không tải được phân tích: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {data && !latest && (
          <p className="text-muted-foreground">
            Chưa có phân tích cho hội thoại này. AI có thể đang tắt, hoặc tin nhắn chưa được xử lý.
          </p>
        )}

        {latest && (
          <>
            <LatestAnalysis analysis={latest} />
            <p className="text-xs text-muted-foreground">
              {latest.model} · {latest.messageCount} tin · {formatDateTime(latest.createdAt)}
            </p>
          </>
        )}

        {older.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground">Các lần phân tích trước</div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {older.map((item) => (
                <li key={item.id}>
                  {formatDateTime(item.createdAt)}:{" "}
                  {item.status === "FAILED"
                    ? "AI lỗi"
                    : item.intents.map((intent) => intentLabels[intent.type]).join(", ") ||
                      "không có"}
                  {item.needsHuman ? " (cần người xem)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Độ tin cậy do AI tự đánh giá, chỉ mang tính tham khảo.
        </p>
      </CardContent>
    </Card>
  );
}
