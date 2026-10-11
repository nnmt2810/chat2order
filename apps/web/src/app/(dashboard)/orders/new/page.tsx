import { OrderForm } from "@/components/orders/order-form";

export default function NewOrderPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tạo đơn hàng</h1>
      <OrderForm />
    </div>
  );
}
