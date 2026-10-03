import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import type { ProductDto } from "@chat2order/shared/product";
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
import { formatNumber, formatVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_ALIASES_SHOWN = 3;

type ProductTableProps = {
  items: ProductDto[];
  onEdit: (product: ProductDto) => void;
  onArchive: (product: ProductDto) => void;
  onRestore: (product: ProductDto) => void;
};

export function ProductTable({ items, onEdit, onArchive, onRestore }: ProductTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã SKU</TableHead>
            <TableHead>Tên sản phẩm</TableHead>
            <TableHead>Đơn vị</TableHead>
            <TableHead className="text-right">Giá</TableHead>
            <TableHead className="text-right">Tồn kho</TableHead>
            <TableHead>Tên gọi khác</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((product) => (
            <TableRow key={product.id} className={cn(!product.isActive && "text-gray-400")}>
              <TableCell className="font-mono text-xs">{product.sku}</TableCell>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell>{product.unit}</TableCell>
              <TableCell className="text-right">{formatVnd(product.price)}</TableCell>
              <TableCell className="text-right">{formatNumber(product.stock)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {product.aliases.slice(0, MAX_ALIASES_SHOWN).map((alias) => (
                    <Badge key={alias} variant="outline">
                      {alias}
                    </Badge>
                  ))}
                  {product.aliases.length > MAX_ALIASES_SHOWN && (
                    <Badge variant="outline">
                      +{product.aliases.length - MAX_ALIASES_SHOWN}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {product.isActive ? (
                  <Badge variant="secondary">Đang bán</Badge>
                ) : (
                  <Badge variant="outline">Đã lưu trữ</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>
                    <Pencil className="h-4 w-4" />
                    Sửa
                  </Button>
                  {product.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => onArchive(product)}>
                      <Archive className="h-4 w-4" />
                      Lưu trữ
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onRestore(product)}>
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