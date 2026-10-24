"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerInputSchema, type CustomerInput } from "@chat2order/shared/customer";
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
import { useCreateCustomerFromConversation } from "@/lib/conversations";

type CreateCustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  defaultName: string;
};

export function CreateCustomerDialog({
  open,
  onOpenChange,
  conversationId,
  defaultName,
}: CreateCustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo hồ sơ khách hàng</DialogTitle>
          <DialogDescription>
            Tạo hồ sơ mới và gắn với hội thoại này. Số điện thoại, địa chỉ và ghi chú có thể để
            trống, số điện thoại được tự chuẩn hóa.
          </DialogDescription>
        </DialogHeader>
        <CreateCustomerForm
          conversationId={conversationId}
          defaultName={defaultName}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateCustomerForm({
  conversationId,
  defaultName,
  onDone,
}: {
  conversationId: string;
  defaultName: string;
  onDone: () => void;
}) {
  const create = useCreateCustomerFromConversation(conversationId);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: { name: defaultName, phone: "", address: "", note: "" },
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      await create.mutateAsync(input);
      onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="new-customer-name">Tên khách hàng</Label>
        <Input id="new-customer-name" autoComplete="off" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-customer-phone">Số điện thoại</Label>
        <Input id="new-customer-phone" type="tel" autoComplete="off" {...register("phone")} />
        {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-customer-address">Địa chỉ giao hàng</Label>
        <Input id="new-customer-address" autoComplete="off" {...register("address")} />
        {errors.address && <p className="text-sm text-red-600">{errors.address.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-customer-note">Ghi chú</Label>
        <Textarea id="new-customer-note" rows={2} {...register("note")} />
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
          {isSubmitting ? "Đang lưu..." : "Tạo hồ sơ"}
        </Button>
      </DialogFooter>
    </form>
  );
}
