import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import type { CustomerDto } from "@chat2order/shared/customer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type CustomerTableProps = {
  items: CustomerDto[];
  onEdit: (customer: CustomerDto) => void;
  onArchive: (customer: CustomerDto) => void;
  onRestore: (customer: CustomerDto) => void;
};

export function CustomerTable({ items, onEdit, onArchive, onRestore }: CustomerTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên khách hàng</TableHead>
            <TableHead>Số điện thoại</TableHead>
            <TableHead>Địa chỉ</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((customer) => (
            <TableRow key={customer.id} className={cn(!customer.isActive && "text-gray-400")}>
              <TableCell className="font-medium">{customer.name}</TableCell>
              <TableCell>{customer.phone || "—"}</TableCell>
              <TableCell className="max-w-xs truncate" title={customer.address}>
                {customer.address || "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate" title={customer.note}>
                {customer.note || "—"}
              </TableCell>
              <TableCell>
                {customer.isActive ? (
                  <Badge variant="secondary">Đang hoạt động</Badge>
                ) : (
                  <Badge variant="outline">Đã lưu trữ</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(customer)}>
                    <Pencil className="h-4 w-4" />
                    Sửa
                  </Button>
                  {customer.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => onArchive(customer)}>
                      <Archive className="h-4 w-4" />
                      Lưu trữ
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onRestore(customer)}>
                      <ArchiveRestore className="h-4 w-4" />
                      Khôi phục
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
