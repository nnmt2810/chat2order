"use client";

import Link from "next/link";
import { useState } from "react";
import { MAX_MESSAGE_LENGTH, type SimulatedMessageInput } from "@chat2order/shared/conversation";
import type { CustomerDto } from "@chat2order/shared/customer";
import { CustomerPickerDialog } from "@/components/orders/customer-picker-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimulatorThread } from "@/components/simulator/simulator-thread";
import { useSimulateMessage } from "@/lib/conversations";

type Mode = "customer" | "visitor";

const scenarios: { label: string; text: string }[] = [
  {
    label: "Đặt hàng như cũ",
    text: "chị lấy 2 thùng nước suối nhỏ, 1 bao đường, mai giao qua 45 Lê Lợi nha, như cũ",
  },
  {
    label: "Đặt hàng kèm hỏi phí ship",
    text: "chị lấy 2 thùng nước suối loại nhỏ, 1 bao đường, mai giao qua 45 Lê Lợi nha, như cũ. Mà ship tới đó bao nhiêu vậy em?",
  },
  {
    label: "Viết tắt, thiếu dấu",
    text: "lay 2 thung nuoc suoi nho vs 1 bao duong, mai ship 45 le loi nha",
  },
  { label: "Thiếu thông tin", text: "lấy cho chị 3 thùng nước" },
  { label: "Hỏi giờ mở cửa", text: "shop mở cửa mấy giờ vậy em?" },
  { label: "Hỏi phí ship", text: "ship qua quận 7 bao nhiêu vậy shop" },
  { label: "Hỏi tình trạng đơn", text: "đơn hôm qua của mình tới đâu rồi em?" },
  { label: "Khiếu nại", text: "hàng giao bị móp, shop đổi cho mình nha" },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại";
}

export function SimulatorView() {
  const simulate = useSimulateMessage();

  const [mode, setMode] = useState<Mode>("customer");
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [visitorId, setVisitorId] = useState("khach-la-1");
  const [visitorName, setVisitorName] = useState("Khách lạ");
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);

  function resetThread() {
    setLastConversationId(null);
  }

  async function send() {
    setFormError(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setFormError("Vui lòng nhập nội dung tin nhắn");
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setFormError(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
      return;
    }

    let payload: SimulatedMessageInput;
    if (mode === "customer") {
      if (!customer) {
        setFormError("Vui lòng chọn khách hàng");
        return;
      }
      payload = { customerId: customer.id, text: trimmed };
    } else {
      const id = visitorId.trim();
      if (!id) {
        setFormError("Vui lòng nhập mã khách lạ");
        return;
      }
      payload = { visitorId: id, visitorName: visitorName.trim(), text: trimmed };
    }

    try {
      const result = await simulate.mutateAsync(payload);
      setLastConversationId(result.conversation.id);
      setText("");
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Giả lập khách hàng</h1>
        <p className="text-sm text-muted-foreground">
          Đóng vai khách nhắn tin cho cửa hàng của bạn. Tin nhắn đi qua đúng đường dẫn như tin từ
          Zalo hay Messenger, và hiện trong Hộp thư với kênh &quot;Giả lập&quot;.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Người gửi</CardTitle>
          <CardDescription>
            Chọn khách đã có hồ sơ, hoặc giả lập một khách lạ chưa có hồ sơ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "customer" ? "default" : "outline"}
              aria-pressed={mode === "customer"}
              onClick={() => {
                setMode("customer");
                resetThread();
              }}
            >
              Khách hàng có sẵn
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "visitor" ? "default" : "outline"}
              aria-pressed={mode === "visitor"}
              onClick={() => {
                setMode("visitor");
                resetThread();
              }}
            >
              Khách lạ
            </Button>
          </div>

          {mode === "customer" ? (
            <div className="space-y-2">
              <Label htmlFor="customer-trigger">Khách hàng</Label>
              <Button
                id="customer-trigger"
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setPickerOpen(true)}
              >
                {customer ? (
                  <span className="truncate">
                    {customer.name}
                    {customer.phone ? ` · ${customer.phone}` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Chọn khách hàng...</span>
                )}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="visitorId">Mã khách lạ</Label>
                <Input
                  id="visitorId"
                  value={visitorId}
                  maxLength={64}
                  onChange={(event) => {
                    setVisitorId(event.target.value);
                    resetThread();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Cùng mã thì cùng một hội thoại. Đổi mã để giả lập một khách lạ khác.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visitorName">Tên hiển thị (tùy chọn)</Label>
                <Input
                  id="visitorName"
                  value={visitorName}
                  maxLength={100}
                  onChange={(event) => setVisitorName(event.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tin nhắn</CardTitle>
          <CardDescription>Chọn một kịch bản mẫu để điền sẵn, hoặc tự soạn.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {scenarios.map((scenario) => (
              <Button
                key={scenario.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setText(scenario.text)}
              >
                {scenario.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Nội dung</Label>
            <Textarea
              id="message"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Ctrl + Enter để gửi</span>
              <span>
                {text.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}

          {lastConversationId && (
            <p role="status" className="text-sm text-green-700">
              Đã gửi tin nhắn.{" "}
              <Link href={`/inbox/${lastConversationId}`} className="underline underline-offset-4">
                Mở hội thoại
              </Link>
            </p>
          )}

          <Button type="button" onClick={() => void send()} disabled={simulate.isPending}>
            {simulate.isPending ? "Đang gửi..." : "Gửi tin nhắn"}
          </Button>
        </CardContent>
      </Card>

      {lastConversationId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Màn hình của khách</CardTitle>
            <CardDescription>
              Hội thoại nhìn từ phía khách. Trả lời của cửa hàng hiện ở bên trái, tự cập nhật sau
              vài giây.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimulatorThread conversationId={lastConversationId} />
          </CardContent>
        </Card>
      )}

      <CustomerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(next) => {
          setCustomer(next);
          resetThread();
        }}
      />
    </div>
  );
}
