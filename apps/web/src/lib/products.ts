"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProductDto,
  ProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductUpdate,
} from "@chat2order/shared/product";
import { apiFetch } from "@/lib/api";

export type ProductListParams = {
  q: string;
  page: number;
  pageSize: number;
  status: ProductListQuery["status"];
};

const productKeys = {
  all: ["products"] as const,
  list: (params: ProductListParams) => ["products", "list", params] as const,
};

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => {
      const search = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        status: params.status,
      });
      if (params.q) search.set("q", params.q);
      return apiFetch<ProductListResponse>(`/products?${search.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: productKeys.all });
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: ProductInput) =>
      apiFetch<{ product: ProductDto }>("/products", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductUpdate }) =>
      apiFetch<{ product: ProductDto }>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useArchiveProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
