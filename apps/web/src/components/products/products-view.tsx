"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Pagination } from "@/components/common/pagination";
import { SearchBox } from "@/components/common/search-box";
import type { ProductDto } from "@chat2order/shared/product";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductTable } from "@/components/products/product-table";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/lib/use-debounce";
import { useArchiveProduct, useProducts, useUpdateProduct } from "@/lib/products";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại";
}

export function ProductsView() {
  const [search, setSearch] = useState("");
  const [onlyArchived, setOnlyArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [formState, setFormState] = useState<{ open: boolean; product: ProductDto | null }>({
    open: false,
    product: null,
  });
  const [archiveTarget, setArchiveTarget] = useState<ProductDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useDebounce(search.trim());
  const { data, error, isPending, isFetching, refetch } = useProducts({
    q,
    page,
    pageSize: PAGE_SIZE,
    status: onlyArchived ? "archived" : "active",
  });
  const archive = useArchiveProduct();
  const update = useUpdateProduct();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function confirmArchive() {
    if (!archiveTarget) return;
    setActionError(null);
    try {
      await archive.mutateAsync(archiveTarget.id);
      if (data && data.items.length === 1 && page > 1) {
        setPage(page - 1);
      }
    } catch (err) {
      setActionError(errorMessage(err));
    }
    setArchiveTarget(null);
  }

  async function restore(product: ProductDto) {
    setActionError(null);
    try {
      await update.mutateAsync({ id: product.id, input: { isActive: true } });
      if (data && data.items.length === 1 && page > 1) {
        setPage(page - 1);
      }
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sản phẩm & tồn kho</h1>
        <Button onClick={() => setFormState({ open: true, product: null })}>
          <Plus className="h-4 w-4" />
          Thêm sản phẩm
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Tìm theo tên hoặc mã SKU"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlyArchived}
            onChange={(event) => {
              setOnlyArchived(event.target.checked);
              setPage(1);
            }}
          />
          Hiện sản phẩm đã lưu trữ
        </label>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}

      {isPending && <p className="text-gray-500">Đang tải sản phẩm...</p>}

      {error && !data && (
        <div className="space-y-2">
          <p className="text-red-600">Không tải được danh sách: {error.message}</p>
          <Button variant="outline" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          {q
            ? "Không tìm thấy sản phẩm phù hợp."
            : onlyArchived
              ? "Chưa có sản phẩm nào được lưu trữ."
              : "Chưa có sản phẩm nào. Bấm “Thêm sản phẩm” để bắt đầu."}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={cn("space-y-3", isFetching && "opacity-60")}>
          <ProductTable
            items={data.items}
            onEdit={(product) => setFormState({ open: true, product })}
            onArchive={setArchiveTarget}
            onRestore={restore}
          />
          <Pagination
            page={data.page}
            totalPages={totalPages}
            total={data.total}
            noun="sản phẩm"
            onPageChange={setPage}
          />
        </div>
      )}

      <ProductFormDialog
        open={formState.open}
        product={formState.product}
        onOpenChange={(open) => setFormState((state) => ({ ...state, open }))}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Lưu trữ sản phẩm?"
        description={`"${archiveTarget?.name ?? ""}" sẽ bị ẩn khỏi danh sách mặc định. Bạn có thể khôi phục lại bất cứ lúc nào, và lịch sử đơn hàng cũ không bị ảnh hưởng.`}
        confirmLabel="Lưu trữ"
        pendingLabel="Đang lưu trữ..."
        pending={archive.isPending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
