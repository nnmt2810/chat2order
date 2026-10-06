"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  customerInputSchema,
  type CustomerDto,
  type CustomerInput,
} from "@chat2order/shared/customer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useCreateCustomer, useUpdateCustomer } from "@/lib/customers";

type CustomerFormDialogProps = {
  open: boolean;
  customer: CustomerDto | null;
  onOpenChange: (open: boolean) => void;
};

export function CustomerFormDialog({ open, customer, onOpenChange }: CustomerFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? "Sửa khách hàng" : "Thêm khách hàng"}</DialogTitle>
          <DialogDescription>
            Số điện thoại, địa chỉ và ghi chú có thể để trống. Số điện thoại được tự chuẩn hóa, ví
            dụ +84 901 234 567 thành 0901234567.
          </DialogDescription>
        </DialogHeader>
        <CustomerForm customer={customer} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ customer, onDone }: { customer: CustomerDto | null; onDone: () => void }) {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: customer
      ? {
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          note: customer.note,
        }
      : { name: "", phone: "", address: "", note: "" },
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);

    try {
      if (customer) {
        await updateCustomer.mutateAsync({ id: customer.id, input });
      } else {
        await createCustomer.mutateAsync(input);
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setServerError("Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.");
      } else {
        setServerError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Tên khách hàng</Label>
        <Input id="name" autoComplete="off" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Số điện thoại</Label>
        <Input id="phone" type="tel" autoComplete="off" {...register("phone")} />
        {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Địa chỉ giao hàng</Label>
        <Input id="address" autoComplete="off" {...register("address")} />
        {errors.address && <p className="text-sm text-red-600">{errors.address.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Ghi chú</Label>
        <Textarea id="note" rows={3} placeholder="Ví dụ: hay đặt như cũ" {...register("note")} />
        {errors.note && <p className="text-sm text-red-600">{errors.note.message}</p>}
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang lưu..." : "Lưu"}
        </Button>
      </DialogFooter>
    </form>
  );
}
