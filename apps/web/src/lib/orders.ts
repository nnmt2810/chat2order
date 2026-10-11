"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrderDto,
  OrderInput,
  OrderListQuery,
  OrderListResponse,
  OrderStatusChange,
  OrderUpdate,
} from "@chat2order/shared/order";
import { apiFetch } from "@/lib/api";

export type OrderListParams = {
  q: string;
  page: number;
  pageSize: number;
  status: OrderListQuery["status"];
};

const orderKeys = {
  all: ["orders"] as const,
  list: (params: OrderListParams) => ["orders", "list", params] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => {
      const search = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        status: params.status,
      });
      if (params.q) search.set("q", params.q);
      return apiFetch<OrderListResponse>(`/orders?${search.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => (await apiFetch<{ order: OrderDto }>(`/orders/${id}`)).order,
  });
}

export function useChangeOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatusChange["status"] }) =>
      apiFetch<{ order: OrderDto }>(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    // Chạy cả khi lỗi (ví dụ có người vừa đổi trạng thái)
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        // Đổi trạng thái có thể trừ hoặc hoàn tồn kho, nên danh sách sản phẩm cũng cần tải lại
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderInput) =>
      apiFetch<{ order: OrderDto }>("/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OrderUpdate }) =>
      apiFetch<{ order: OrderDto }>(`/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    // Chạy cả khi lỗi: đơn có thể vừa bị đổi trạng thái ở nơi khác
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}
