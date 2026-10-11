"use client";

import Link from "next/link";
import { OrderForm } from "@/components/orders/order-form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useOrder } from "@/lib/orders";

export function OrderEditView({ id }: { id: string }) {
  const { data: order, error, isPending, refetch } = useOrder(id);

  if (isPending) {
    return <p className="text-muted-foreground">Đang tải đơn hàng...</p>;
  }

  if (error || !order) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-3">
        <p className={notFound ? "text-muted-foreground" : "text-red-600"}>
          {notFound ? "Không tìm thấy đơn hàng này." : `Không tải được đơn hàng: ${error?.message}`}
        </p>
        {!notFound && (
          <Button variant="outline" onClick={() => refetch()}>
            Thử lại
          </Button>
        )}
        <Link href="/orders" className="block text-sm underline underline-offset-4">
          Về danh sách đơn hàng
        </Link>
      </div>
    );
  }

  if (order.status !== "PENDING") {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Chỉ sửa được đơn đang chờ xác nhận.</p>
        <Link href={`/orders/${order.id}`} className="text-sm underline underline-offset-4">
          Xem đơn {order.code}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sửa đơn {order.code}</h1>
      <OrderForm order={order} />
    </div>
  );
}
