"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AuthUser, LoginInput, RegisterInput } from "@chat2order/shared/auth";
import { apiFetch } from "@/lib/api";

export const authKeys = { me: ["auth", "me"] as const };

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => (await apiFetch<{ user: AuthUser }>("/auth/me")).user,
    retry: false,
    staleTime: 60_000,
  });
}

function useAuthMutation<TInput>(path: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TInput) =>
      (
        await apiFetch<{ user: AuthUser }>(path, {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).user,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      router.replace("/inbox");
    },
  });
}

export const useLogin = () => useAuthMutation<LoginInput>("/auth/login");
export const useRegister = () => useAuthMutation<RegisterInput>("/auth/register");

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<null>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      // Xóa toàn bộ dữ liệu đã cache để người dùng sau không thấy dữ liệu của người trước
      queryClient.clear();
      router.replace("/login");
    },
  });
}
