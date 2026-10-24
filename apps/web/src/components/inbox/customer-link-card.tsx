"use client";

import { useState } from "react";
import type { ConversationDto } from "@chat2order/shared/conversation";
import { CreateCustomerDialog } from "@/components/inbox/create-customer-dialog";
import { CustomerPickerDialog } from "@/components/orders/customer-picker-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLinkCustomer } from "@/lib/conversations";

export function CustomerLinkCard({ conversation }: { conversation: ConversationDto }) {
  const link = useLinkCustomer(conversation.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = conversation.customerId !== null;

  async function changeLink(customerId: string | null) {
    setError(null);
    try {
      await link.mutateAsync(customerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Khách hàng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {linked ? (
            <>
              <div className="font-medium">{conversation.customerName}</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => setPickerOpen(true)}
                >
                  Đổi khách
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => void changeLink(null)}
                >
                  Gỡ liên kết
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Khách này chưa có hồ sơ. Liên kết với khách có sẵn hoặc tạo hồ sơ mới để lên đơn cho
                đúng người.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Tạo hồ sơ mới
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => setPickerOpen(true)}
                >
                  Liên kết khách có sẵn
                </Button>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <CustomerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(customer) => void changeLink(customer.id)}
      />
      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        conversationId={conversation.id}
        defaultName={conversation.displayName}
      />
    </>
  );
}
