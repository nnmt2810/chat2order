"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { WEB_URL } from "@/lib/config";
import { useWebChatSettings } from "@/lib/shop";

export function WebChatSettingsCard() {
  const { data, error, isPending, refetch } = useWebChatSettings();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const snippet = data
    ? `<script src="${WEB_URL}/chat-widget.js" data-shop-key="${data.webChatKey}" data-api-url="${API_URL}" defer></script>`
    : "";

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kênh web chat</CardTitle>
        <CardDescription>
          Dán đoạn mã dưới đây vào website của cửa hàng (trước thẻ đóng body). Khách bấm vào bong
          bóng chat ở góc màn hình là nhắn được, tin nhắn hiện trong Hộp thư với kênh Website.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isPending && <p className="text-muted-foreground">Đang tải...</p>}

        {error && !data && (
          <div className="space-y-2">
            <p className="text-red-600">Không tải được cài đặt: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {data && (
          <>
            <div className="space-y-1">
              <div className="font-medium">Khóa cửa hàng</div>
              <code className="block break-all rounded-md border bg-muted px-3 py-2 text-xs">
                {data.webChatKey}
              </code>
              <p className="text-xs text-muted-foreground">
                Khóa này là công khai: ai xem mã nguồn trang web cũng thấy được. Nó chỉ cho biết tin
                nhắn thuộc cửa hàng nào, không dùng để đăng nhập hay đọc dữ liệu.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">Đoạn mã nhúng</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copySnippet()}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Đã sao chép" : "Sao chép"}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
                <code>{snippet}</code>
              </pre>
              {copyFailed && (
                <p role="alert" className="text-xs text-red-600">
                  Không tự sao chép được, hãy bôi đen đoạn mã rồi sao chép thủ công.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="font-medium">Tùy chỉnh (không bắt buộc)</div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  <code>data-title</code>: tiêu đề khung chat, ví dụ{" "}
                  <code>data-title=&quot;Hỗ trợ khách hàng&quot;</code>
                </li>
                <li>
                  <code>data-color</code>: màu chủ đạo dạng <code>#rrggbb</code>, nên chọn màu đậm
                  để chữ trắng dễ đọc
                </li>
              </ul>
            </div>

            <a
              href={`/widget-demo.html?shopKey=${encodeURIComponent(data.webChatKey)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium underline underline-offset-4"
            >
              Mở trang thử widget
            </a>
          </>
        )}
      </CardContent>
    </Card>
  );
}
