"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  orderStatusLabels,
  orderTransitions,
  stockEffect,
  type OrderDto,
  type OrderStatusChange,
} from "@chat2order/shared/order";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { useChangeOrderStatus, useOrder } from "@/lib/orders";

type TargetStatus = OrderStatusChange["status"];

const actionLabels: Record<TargetStatus, string> = {
  CONFIRMED: "Xác nhận đơn",
  SHIPPING: "Bắt đầu giao",
  COMPLETED: "Hoàn tất đơn",
  CANCELLED: "Hủy đơn",
};

const confirmTitles: Partial<Record<TargetStatus, string>> = {
  CONFIRMED: "Xác nhận đơn hàng?",
  CANCELLED: "Hủy đơn hàng?",
};

function isTarget(status: string): status is TargetStatus {
  return status !== "PENDING";
}

function describeAction(order: OrderDto, target: TargetStatus): string {
  const effect = stockEffect(order.status, target);
  if (effect === "deduct") {
    return "Tồn kho sẽ được trừ theo các dòng hàng của đơn. Nếu không đủ hàng, đơn sẽ không được xác nhận.";
  }
  if (effect === "restore") {
    return "Hàng của đơn sẽ được hoàn lại vào tồn kho. Đơn đã hủy không thể mở lại.";
  }
  if (target === "CANCELLED") {
    return "Đơn đã hủy không thể mở lại.";
  }
  return `Đơn sẽ chuyển sang trạng thái "${orderStatusLabels[target]}".`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại";
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Danh sách đơn hàng
    </Link>
  );
}

export function OrderDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { data: order, error, isPending, refetch } = useOrder(id);
  const changeStatus = useChangeOrderStatus();
  const [pendingTarget, setPendingTarget] = useState<TargetStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(target: TargetStatus) {
    setActionError(null);
    try {
      await changeStatus.mutateAsync({ id, status: target });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function confirmPending() {
    if (!pendingTarget) return;
    await run(pendingTarget);
    setPendingTarget(null);
  }

  if (isPending) {
    return <p className="text-muted-foreground">Đang tải đơn hàng...</p>;
  }

  if (error || !order) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-3">
        <BackLink />
        <p className={notFound ? "text-muted-foreground" : "text-red-600"}>
          {notFound ? "Không tìm thấy đơn hàng này." : `Không tải được đơn hàng: ${error?.message}`}
        </p>
        {!notFound && (
          <Button variant="outline" onClick={() => refetch()}>
            Thử lại
          </Button>
        )}
      </div>
    );
  }

  const targets = orderTransitions[order.status].filter(isTarget);

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Đơn {order.code}</h1>
          <OrderStatusBadge status={order.status} />
        </div>

        {targets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {order.status === "PENDING" && (
              <Button
                variant="outline"
                disabled={changeStatus.isPending}
                onClick={() => router.push(`/orders/${order.id}/edit`)}
              >
                Sửa đơn
              </Button>
            )}
            {targets.map((target) => (
              <Button
                key={target}
                variant={target === "CANCELLED" ? "outline" : "default"}
                disabled={changeStatus.isPending}
                onClick={() => {
                  if (confirmTitles[target]) {
                    setPendingTarget(target);
                  } else {
                    void run(target);
                  }
                }}
              >
                {actionLabels[target]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Khách hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">{order.customerName}</div>
            <div className="text-muted-foreground">
              {order.customerPhone || "Chưa có số điện thoại"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Giao hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Địa chỉ: </span>
              {order.deliveryAddress || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Ngày giao: </span>
              {formatDate(order.deliveryDate)}
            </div>
            <div>
              <span className="text-muted-foreground">Ghi chú: </span>
              {order.note || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Ngày tạo: </span>
              {formatDateTime(order.createdAt)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sản phẩm</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="text-right">Đơn giá</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                </TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right">{formatVnd(item.unitPrice)}</TableCell>
                <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                <TableCell className="text-right">{formatVnd(item.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tạm tính</span>
          <span>{formatVnd(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Phí giao hàng</span>
          <span>{formatVnd(order.shippingFee)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Tổng cộng</span>
          <span>{formatVnd(order.total)}</span>
        </div>
      </div>

      <ConfirmDialog
        open={pendingTarget !== null}
        title={pendingTarget ? (confirmTitles[pendingTarget] ?? "Xác nhận") : ""}
        description={pendingTarget ? describeAction(order, pendingTarget) : ""}
        confirmLabel={pendingTarget ? actionLabels[pendingTarget] : ""}
        pendingLabel="Đang xử lý..."
        pending={changeStatus.isPending}
        destructive={pendingTarget === "CANCELLED"}
        onConfirm={confirmPending}
        onCancel={() => setPendingTarget(null)}
      />
    </div>
  );
}
