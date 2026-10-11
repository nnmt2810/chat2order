"use client";

import { useState } from "react";
import type { CustomerDto } from "@chat2order/shared/customer";
import { SearchBox } from "@/components/common/search-box";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCustomers } from "@/lib/customers";
import { useDebounce } from "@/lib/use-debounce";

type CustomerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: CustomerDto) => void;
};

export function CustomerPickerDialog({ open, onOpenChange, onSelect }: CustomerPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chọn khách hàng</DialogTitle>
          <DialogDescription>Chỉ hiện khách hàng đang hoạt động.</DialogDescription>
        </DialogHeader>
        <CustomerList
          onSelect={(customer) => {
            onSelect(customer);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CustomerList({ onSelect }: { onSelect: (customer: CustomerDto) => void }) {
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim());
  const { data, error, isPending } = useCustomers({ q, page: 1, pageSize: 20, status: "active" });

  return (
    <div className="space-y-3">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Tìm theo tên hoặc số điện thoại"
      />

      {isPending && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {error && !data && (
        <p className="text-sm text-red-600">Không tải được danh sách khách hàng.</p>
      )}

      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {q
            ? "Không tìm thấy khách hàng phù hợp."
            : "Chưa có khách hàng nào. Hãy thêm ở trang Khách hàng."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {data.items.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onSelect(customer)}
              >
                <span className="font-medium">{customer.name}</span>
                <span className="text-xs text-muted-foreground">
                  {customer.phone || "Chưa có số điện thoại"}
                  {customer.address ? ` · ${customer.address}` : ""}
                </span>
              </button>
            </li>
          ))}
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
