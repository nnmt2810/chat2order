"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CustomerDto,
  CustomerInput,
  CustomerListQuery,
  CustomerListResponse,
  CustomerUpdate,
} from "@chat2order/shared/customer";
import { apiFetch } from "@/lib/api";

export type CustomerListParams = {
  q: string;
  page: number;
  pageSize: number;
  status: CustomerListQuery["status"];
};

const customerKeys = {
  all: ["customers"] as const,
  list: (params: CustomerListParams) => ["customers", "list", params] as const,
};

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => {
      const search = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        status: params.status,
      });
      if (params.q) search.set("q", params.q);
      return apiFetch<CustomerListResponse>(`/customers?${search.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: customerKeys.all });
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiFetch<{ customer: CustomerDto }>("/customers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerUpdate }) =>
      apiFetch<{ customer: CustomerDto }>(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useArchiveCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/customers/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
