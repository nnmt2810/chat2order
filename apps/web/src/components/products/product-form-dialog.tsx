"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { productInputSchema, type ProductDto } from "@chat2order/shared/product";
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
import { ApiError } from "@/lib/api";
import { useCreateProduct, useUpdateProduct } from "@/lib/products";

// Form nhập tên gọi khác thành một chuỗi, nên thay trường `aliases` (mảng) bằng `aliasesText`
const formSchema = productInputSchema.omit({ aliases: true }).extend({
  aliasesText: z.string().max(2000, "Nội dung quá dài"),
});

type FormValues = z.infer<typeof formSchema>;

function parseAliases(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type ProductFormDialogProps = {
  open: boolean;
  product: ProductDto | null;
  onOpenChange: (open: boolean) => void;
};

export function ProductFormDialog({ open, product, onOpenChange }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Sửa sản phẩm" : "Thêm sản phẩm"}</DialogTitle>
          <DialogDescription>
            Tên gọi khác giúp hệ thống hiểu cách khách gọi sản phẩm, ví dụ &quot;nước suối
            nhỏ&quot;. Ngăn cách bằng dấu phẩy.
          </DialogDescription>
        </DialogHeader>
        <ProductForm product={product} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, onDone }: { product: ProductDto | null; onDone: () => void }) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: product
      ? {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          price: product.price,
          stock: product.stock,
          aliasesText: product.aliases.join(", "),
        }
      : { sku: "", name: "", unit: "", price: 0, stock: 0, aliasesText: "" },
  });

  const onSubmit = handleSubmit(async ({ aliasesText, ...rest }) => {
    setServerError(null);
    const input = { ...rest, aliases: parseAliases(aliasesText) };

    try {
      if (product) {
        await updateProduct.mutateAsync({ id: product.id, input });
      } else {
        await createProduct.mutateAsync(input);
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SKU_TAKEN") {
        setError("sku", { message: "Mã sản phẩm đã tồn tại" });
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setServerError("Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại (tối đa 20 tên gọi khác).");
      } else {
        setServerError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">Mã SKU</Label>
          <Input id="sku" {...register("sku")} />
          {errors.sku && <p className="text-sm text-red-600">{errors.sku.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Đơn vị tính</Label>
          <Input id="unit" placeholder="thùng, bao, cái..." {...register("unit")} />
          {errors.unit && <p className="text-sm text-red-600">{errors.unit.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Tên sản phẩm</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Giá (đồng)</Label>
          <Input
            id="price"
            type="number"
            inputMode="numeric"
            min={0}
            {...register("price", { valueAsNumber: true })}
          />
          {errors.price && <p className="text-sm text-red-600">{errors.price.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock">Tồn kho</Label>
          <Input
            id="stock"
            type="number"
            inputMode="numeric"
            min={0}
            {...register("stock", { valueAsNumber: true })}
          />
          {errors.stock && <p className="text-sm text-red-600">{errors.stock.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="aliasesText">Tên gọi khác</Label>
        <Input
          id="aliasesText"
          placeholder="nước suối nhỏ, chai nhỏ"
          {...register("aliasesText")}
        />
        {errors.aliasesText && (
          <p className="text-sm text-red-600">{errors.aliasesText.message}</p>
        )}
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