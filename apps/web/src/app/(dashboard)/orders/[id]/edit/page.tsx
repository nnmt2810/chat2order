import { OrderEditView } from "@/components/orders/order-edit-view";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderEditView id={id} />;
}
