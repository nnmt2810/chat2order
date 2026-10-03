import type {
  ProductDto,
  ProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductUpdate,
} from "@chat2order/shared/product";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { prismaErrorCode } from "../lib/prisma-error.js";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  aliases: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    aliases: row.aliases,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWriteError(err: unknown): never {
  const code = prismaErrorCode(err);
  if (code === "P2002") {
    throw new AppError(409, "Mã sản phẩm đã tồn tại", "SKU_TAKEN");
  }
  if (code === "P2025") {
    throw new AppError(404, "Không tìm thấy sản phẩm", "PRODUCT_NOT_FOUND");
  }
  throw err;
}

export async function listProducts(
  shopId: string,
  query: ProductListQuery,
): Promise<ProductListResponse> {
  const statusFilter =
    query.status === "active"
      ? { isActive: true }
      : query.status === "archived"
        ? { isActive: false }
        : {};

  const where = {
    shopId,
    ...statusFilter,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { sku: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getProduct(shopId: string, id: string): Promise<ProductDto> {
  const row = await prisma.product.findFirst({ where: { id, shopId } });
  if (!row) {
    throw new AppError(404, "Không tìm thấy sản phẩm", "PRODUCT_NOT_FOUND");
  }
  return toDto(row);
}

export async function createProduct(shopId: string, input: ProductInput): Promise<ProductDto> {
  try {
    const row = await prisma.product.create({ data: { ...input, shopId } });
    return toDto(row);
  } catch (err) {
    mapWriteError(err);
  }
}

export async function updateProduct(
  shopId: string,
  id: string,
  input: ProductUpdate,
): Promise<ProductDto> {
  try {
    const row = await prisma.product.update({ where: { id, shopId }, data: input });
    return toDto(row);
  } catch (err) {
    mapWriteError(err);
  }
}

export async function archiveProduct(shopId: string, id: string): Promise<void> {
  try {
    await prisma.product.update({ where: { id, shopId }, data: { isActive: false } });
  } catch (err) {
    mapWriteError(err);
  }
}
