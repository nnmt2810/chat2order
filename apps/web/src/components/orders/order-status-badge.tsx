import { orderStatusLabels, type OrderStatus } from "@chat2order/shared/order";
import { Badge } from "@/components/ui/badge";

const styles: Record<OrderStatus, string> = {
  PENDING:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED:
    "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  SHIPPING:
    "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  COMPLETED:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  CANCELLED:
    "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={styles[status]}>
      {orderStatusLabels[status]}
    </Badge>
  );
}
