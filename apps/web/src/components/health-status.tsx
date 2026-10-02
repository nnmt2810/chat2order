"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type HealthResponse = {
  status: string;
  uptime: number;
  timestamp: string;
};

export function HealthStatus() {
  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    refetchInterval: 10_000,
  });

  const state = isPending ? "checking" : error || data?.status !== "ok" ? "down" : "ok";

  const config = {
    checking: { dot: "bg-gray-400", label: "Đang kiểm tra API..." },
    ok: { dot: "bg-green-500", label: "API hoạt động" },
    down: { dot: "bg-red-500", label: "Không kết nối được API" },
  }[state];

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className={cn("h-2 w-2 rounded-full", config.dot)} />
      {config.label}
    </div>
  );
}
