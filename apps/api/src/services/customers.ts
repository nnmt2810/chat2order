import type {
  CustomerDto,
  CustomerInput,
  CustomerListQuery,
  CustomerListResponse,
  CustomerUpdate,
} from "@chat2order/shared/customer";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { prismaErrorCode } from "../lib/prisma-error.js";

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    note: row.note,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWriteError(err: unknown): never {
  if (prismaErrorCode(err) === "P2025") {
    throw new AppError(404, "Không tìm thấy khách hàng", "CUSTOMER_NOT_FOUND");
  }
  throw err;
}

export async function listCustomers(
  shopId: string,
  query: CustomerListQuery,
): Promise<CustomerListResponse> {
  const statusFilter =
    query.status === "active"
      ? { isActive: true }
      : query.status === "archived"
        ? { isActive: false }
        : {};

  // Số điện thoại lưu đã bỏ dấu cách, nên bỏ dấu cách khỏi từ khóa khi so khớp
  const phoneTerm = query.q?.replace(/[\s.\-()]/g, "");

  const where = {
    shopId,
    ...statusFilter,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            ...(phoneTerm ? [{ phone: { contains: phoneTerm } }] : []),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getCustomer(shopId: string, id: string): Promise<CustomerDto> {
  const row = await prisma.customer.findFirst({ where: { id, shopId } });
  if (!row) {
    throw new AppError(404, "Không tìm thấy khách hàng", "CUSTOMER_NOT_FOUND");
  }
  return toDto(row);
}

export async function createCustomer(shopId: string, input: CustomerInput): Promise<CustomerDto> {
  const row = await prisma.customer.create({ data: { ...input, shopId } });
  return toDto(row);
}

export async function updateCustomer(
  shopId: string,
  id: string,
  input: CustomerUpdate,
): Promise<CustomerDto> {
  try {
    const row = await prisma.customer.update({ where: { id, shopId }, data: input });
    return toDto(row);
  } catch (err) {
    mapWriteError(err);
  }
}

export async function archiveCustomer(shopId: string, id: string): Promise<void> {
  try {
    await prisma.customer.update({ where: { id, shopId }, data: { isActive: false } });
  } catch (err) {
    mapWriteError(err);
  }
}
