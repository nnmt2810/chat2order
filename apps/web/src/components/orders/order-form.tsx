"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import type { CustomerDto } from "@chat2order/shared/customer";
import {
  MAX_ORDER_TOTAL,
  computeOrderTotals,
  orderInputSchema,
  type OrderDto,
  type OrderInput,
  type OrderUpdate,
} from "@chat2order/shared/order";
import type { ProductDto } from "@chat2order/shared/product";
import { CustomerPickerDialog } from "@/components/orders/customer-picker-dialog";
import { ProductPickerDialog } from "@/components/orders/product-picker-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatVnd } from "@/lib/format";
import { useCreateOrder, useUpdateOrder } from "@/lib/orders";

type CustomerOption = { id: string; name: string; phone: string; address: string | null };

type LineProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number | null;
};

const lineGrid = "sm:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_2.5rem]";

function toDefaults(order?: OrderDto): OrderInput {
  if (!order) {
    return {
      customerId: "",
      deliveryAddress: "",
      deliveryDate: "",
      note: "",
      shippingFee: 0,
      items: [],
    };
  }
  return {
    customerId: order.customerId,
    deliveryAddress: order.deliveryAddress,
    deliveryDate: order.deliveryDate ?? "",
    note: order.note,
    shippingFee: order.shippingFee,
    items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
  };
}

// Với đơn đang sửa, dùng giá đã chụp lúc đặt để hiển thị các dòng cũ
function toLineProducts(order?: OrderDto): Record<string, LineProduct> {
  const result: Record<string, LineProduct> = {};
  for (const item of order?.items ?? []) {
    result[item.productId] = {
      id: item.productId,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      price: item.unitPrice,
      stock: null,
    };
  }
  return result;
}

function itemsKey(items: { productId: string; quantity: number }[]): string {
  return items.map((item) => `${item.productId}:${item.quantity}`).join("|");
}

export function OrderForm({ order }: { order?: OrderDto }) {
  const router = useRouter();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();

  const [customer, setCustomer] = useState<CustomerOption | null>(
    order
      ? {
          id: order.customerId,
          name: order.customerName,
          phone: order.customerPhone,
          address: null,
        }
      : null,
  );
  const [lineProducts, setLineProducts] = useState<Record<string, LineProduct>>(() =>
    toLineProducts(order),
  );
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPicker, setProductPicker] = useState<{ index: number | null } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderInputSchema),
    defaultValues: toDefaults(order),
  });

  const { fields, append, update, remove } = useFieldArray({ control, name: "items" });

  const watchedItems = useWatch({ control, name: "items" }) ?? [];
  const watchedFee = useWatch({ control, name: "shippingFee" });

  const totals = computeOrderTotals(
    watchedItems.map((item) => ({
      unitPrice: lineProducts[item.productId]?.price ?? 0,
      quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
    })),
    Number.isFinite(watchedFee) ? watchedFee : 0,
  );

  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  function selectCustomer(next: CustomerDto) {
    const address = getValues("deliveryAddress");
    if (address.trim() === "" || address === customer?.address) {
      setValue("deliveryAddress", next.address, { shouldDirty: true });
    }
    setCustomer({ id: next.id, name: next.name, phone: next.phone, address: next.address });
    setValue("customerId", next.id, { shouldValidate: true, shouldDirty: true });
  }

  function selectProduct(product: ProductDto) {
    setLineProducts((current) => ({
      ...current,
      [product.id]: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        price: product.price,
        stock: product.stock,
      },
    }));

    const target = productPicker?.index ?? null;
    if (target === null) {
      append({ productId: product.id, quantity: 1 });
    } else {
      const current = getValues(`items.${target}.quantity`);
      update(target, {
        productId: product.id,
        quantity: Number.isFinite(current) && current > 0 ? current : 1,
      });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (order) {
        const itemsChanged = itemsKey(values.items) !== itemsKey(toDefaults(order).items);
        // Chỉ gửi items khi thật sự đổi, nếu không API sẽ chụp lại giá hiện tại của sản phẩm
        const payload: OrderUpdate = {
          customerId: values.customerId,
          deliveryAddress: values.deliveryAddress,
          deliveryDate: values.deliveryDate,
          note: values.note,
          shippingFee: values.shippingFee,
          ...(itemsChanged ? { items: values.items } : {}),
        };
        await updateOrder.mutateAsync({ id: order.id, input: payload });
        router.push(`/orders/${order.id}`);
      } else {
        const { order: created } = await createOrder.mutateAsync(values);
        router.push(`/orders/${created.id}`);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-6" noValidate>
      <section className="space-y-2">
        <Label htmlFor="customer-trigger">Khách hàng</Label>
        <Button
          id="customer-trigger"
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => setCustomerPickerOpen(true)}
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
        {errors.customerId && <p className="text-sm text-red-600">{errors.customerId.message}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="deliveryAddress">Địa chỉ giao hàng</Label>
          <Input id="deliveryAddress" autoComplete="off" {...register("deliveryAddress")} />
          <p className="text-xs text-muted-foreground">
            Để trống khi tạo đơn thì dùng địa chỉ của khách hàng.
          </p>
          {errors.deliveryAddress && (
            <p className="text-sm text-red-600">{errors.deliveryAddress.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="deliveryDate">Ngày giao</Label>
          <Input id="deliveryDate" type="date" {...register("deliveryDate")} />
          {errors.deliveryDate && (
            <p className="text-sm text-red-600">{errors.deliveryDate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="shippingFee">Phí giao hàng (đồng)</Label>
          <Input
            id="shippingFee"
            type="number"
            inputMode="numeric"
            min={0}
            {...register("shippingFee", { valueAsNumber: true })}
          />
          {errors.shippingFee && (
            <p className="text-sm text-red-600">{errors.shippingFee.message}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="note">Ghi chú</Label>
          <Textarea id="note" rows={2} {...register("note")} />
          {errors.note && <p className="text-sm text-red-600">{errors.note.message}</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Sản phẩm</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setProductPicker({ index: null })}
          >
            <Plus className="h-4 w-4" />
            Thêm sản phẩm
          </Button>
        </div>

        {fields.length === 0 && (
          <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            Chưa có sản phẩm nào. Bấm “Thêm sản phẩm” để chọn.
          </div>
        )}

        {fields.length > 0 && (
          <div className={`hidden gap-3 px-3 text-xs text-muted-foreground sm:grid ${lineGrid}`}>
            <span>Sản phẩm (bấm để đổi)</span>
            <span>Số lượng</span>
            <span className="text-right">Đơn giá</span>
            <span className="text-right">Thành tiền</span>
            <span />
          </div>
        )}

        {fields.map((field, index) => {
          const item = watchedItems[index];
          const product = item ? lineProducts[item.productId] : undefined;
          const quantity = item && Number.isFinite(item.quantity) ? item.quantity : 0;
          const stock = product?.stock ?? null;
          const lowStock = stock !== null && quantity > stock;
          const quantityError = errors.items?.[index]?.quantity?.message;

          return (
            <div
              key={field.id}
              className={`grid gap-3 rounded-lg border bg-card p-3 sm:items-start ${lineGrid}`}
            >
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => setProductPicker({ index })}
              >
                <div className="truncate font-medium">{product?.name ?? "Chọn sản phẩm"}</div>
                <div className="text-xs text-muted-foreground">
                  {product ? `${product.sku} · ${product.unit}` : ""}
                </div>
              </button>

              <div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-label={`Số lượng ${product?.name ?? ""}`}
                  {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                />
                {quantityError && <p className="mt-1 text-xs text-red-600">{quantityError}</p>}
                {lowStock && (
                  <p className="mt-1 text-xs text-amber-600">
                    Tồn kho chỉ còn {formatNumber(stock)}
                  </p>
                )}
              </div>

              <div className="text-sm sm:pt-2 sm:text-right">{formatVnd(product?.price ?? 0)}</div>
              <div className="text-sm font-medium sm:pt-2 sm:text-right">
                {formatVnd((product?.price ?? 0) * quantity)}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Xóa dòng hàng"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {itemsError && <p className="text-sm text-red-600">{itemsError}</p>}
      </section>

      <section className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tạm tính</span>
          <span>{formatVnd(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Phí giao hàng</span>
          <span>{formatVnd(Number.isFinite(watchedFee) ? watchedFee : 0)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Tổng cộng</span>
          <span>{formatVnd(totals.total)}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Tổng tiền cuối cùng do máy chủ tính theo giá hiện tại của sản phẩm khi lưu.
        </p>
        {totals.total > MAX_ORDER_TOTAL && (
          <p className="text-xs text-red-600">
            Tổng tiền vượt giới hạn {formatNumber(MAX_ORDER_TOTAL)} đồng.
          </p>
        )}
      </section>

      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(order ? `/orders/${order.id}` : "/orders")}
        >
          Hủy
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang lưu..." : order ? "Lưu thay đổi" : "Tạo đơn"}
        </Button>
      </div>

      <CustomerPickerDialog
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        onSelect={selectCustomer}
      />
      <ProductPickerDialog
        open={productPicker !== null}
        onOpenChange={(open) => {
          if (!open) setProductPicker(null);
        }}
        disabledIds={new Set(watchedItems.map((item) => item.productId))}
        onSelect={selectProduct}
      />
    </form>
  );
}
