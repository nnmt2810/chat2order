import Link from "next/link";
import type { OrderDto } from "@chat2order/shared/order";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";

export function OrderTable({ items }: { items: OrderDto[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đơn</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Ngày giao</TableHead>
            <TableHead className="text-right">Tổng tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày tạo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Link
                  href={`/orders/${order.id}`}
                  className="font-mono text-sm font-medium underline-offset-4 hover:underline"
                >
                  {order.code}
                </Link>
              </TableCell>
              <TableCell>
                <div className="font-medium">{order.customerName}</div>
                {order.customerPhone && (
                  <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                )}
              </TableCell>
              <TableCell>{formatDate(order.deliveryDate)}</TableCell>
              <TableCell className="text-right">{formatVnd(order.total)}</TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(order.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
