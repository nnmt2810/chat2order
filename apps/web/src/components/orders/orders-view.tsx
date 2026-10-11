"use client";

import { useState } from "react";
import { orderStatusLabels, orderStatuses, type OrderListQuery } from "@chat2order/shared/order";
import { Pagination } from "@/components/common/pagination";
import { SearchBox } from "@/components/common/search-box";
import { OrderTable } from "@/components/orders/order-table";
import { Button } from "@/components/ui/button";
import { useOrders } from "@/lib/orders";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type StatusFilter = OrderListQuery["status"];

const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  ...orderStatuses.map((status) => ({ value: status, label: orderStatusLabels[status] })),
];

export function OrdersView() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const q = useDebounce(search.trim());
  const { data, error, isPending, isFetching, refetch } = useOrders({
    q,
    page,
    pageSize: PAGE_SIZE,
    status,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const statusLabel = filters.find((filter) => filter.value === status)?.label ?? "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Đơn hàng</h1>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            variant={status === filter.value ? "default" : "outline"}
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <SearchBox
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo mã đơn (DH00012) hoặc tên khách"
      />

      {isPending && <p className="text-muted-foreground">Đang tải đơn hàng...</p>}

      {error && !data && (
        <div className="space-y-2">
          <p className="text-red-600">Không tải được danh sách: {error.message}</p>
          <Button variant="outline" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground">
          {q
            ? "Không tìm thấy đơn hàng phù hợp."
            : status !== "all"
              ? `Chưa có đơn nào ở trạng thái "${statusLabel}".`
              : "Chưa có đơn hàng nào."}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={cn("space-y-3", isFetching && "opacity-60")}>
          <OrderTable items={data.items} />
          <Pagination
            page={data.page}
            totalPages={totalPages}
            total={data.total}
            noun="đơn hàng"
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
