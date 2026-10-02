"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type HealthResponse = {
  status: string;
  uptime: number;
  timestamp: string;
};

export function HealthStatus() {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    refetchInterval: 10_000,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-500">Trạng thái API</h2>

      {isPending && <p className="mt-2 text-gray-600">Đang kiểm tra...</p>}

      {error && (
        <p className="mt-2 text-red-600">Không kết nối được API: {error.message}</p>
      )}

      {data && (
        <p className="mt-2 text-green-700">
          API đang hoạt động (chạy được {Math.round(data.uptime)} giây)
        </p>
      )}

      <button
        type="button"
        onClick={() => refetch()}
        disabled={isFetching}
        className="mt-3 rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {isFetching ? "Đang kiểm tra..." : "Kiểm tra lại"}
      </button>
    </section>
  );
}