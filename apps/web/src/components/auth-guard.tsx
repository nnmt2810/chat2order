"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: user, error, isPending, refetch } = useCurrentUser();
  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">Đang tải...</div>
    );
  }

  if (unauthorized) return null;

  if (error || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-gray-700">Không kết nối được máy chủ.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
