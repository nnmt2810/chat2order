"use client";

import { useState } from "react";
import type { ProductDto } from "@chat2order/shared/product";
import { SearchBox } from "@/components/common/search-box";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber, formatVnd } from "@/lib/format";
import { useProducts } from "@/lib/products";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";

type ProductPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabledIds: ReadonlySet<string>;
  onSelect: (product: ProductDto) => void;
};

export function ProductPickerDialog({
  open,
  onOpenChange,
  disabledIds,
  onSelect,
}: ProductPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chọn sản phẩm</DialogTitle>
          <DialogDescription>
            Chỉ hiện sản phẩm đang bán. Sản phẩm đã có trong đơn không chọn lại được.
          </DialogDescription>
        </DialogHeader>
        <ProductList
          disabledIds={disabledIds}
          onSelect={(product) => {
            onSelect(product);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProductList({
  disabledIds,
  onSelect,
}: {
  disabledIds: ReadonlySet<string>;
  onSelect: (product: ProductDto) => void;
}) {
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim());
  const { data, error, isPending } = useProducts({ q, page: 1, pageSize: 20, status: "active" });

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="Tìm theo tên hoặc mã SKU" />

      {isPending && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {error && !data && <p className="text-sm text-red-600">Không tải được danh sách sản phẩm.</p>}

      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {q
            ? "Không tìm thấy sản phẩm phù hợp."
            : "Chưa có sản phẩm nào. Hãy thêm ở trang Sản phẩm."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {data.items.map((product) => {
            const alreadyAdded = disabledIds.has(product.id);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={alreadyAdded}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm focus-visible:outline-none",
                    alreadyAdded
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-accent focus-visible:bg-accent",
                  )}
                  onClick={() => onSelect(product)}
                >
                  <span className="font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {product.sku} · {formatVnd(product.price)}/{product.unit} ·{" "}
                    {product.stock === 0 ? (
                      <span className="text-red-600">Hết hàng</span>
                    ) : (
                      `Tồn: ${formatNumber(product.stock)}`
                    )}
                    {alreadyAdded ? " · Đã có trong đơn" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.total > data.items.length && (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện {data.items.length} kết quả đầu tiên. Gõ thêm để thu hẹp tìm kiếm.
        </p>
      )}
    </div>
  );
}
