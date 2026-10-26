"use client";

import { useQuery } from "@tanstack/react-query";
import type { WebChatSettings } from "@chat2order/shared/conversation";
import { apiFetch } from "@/lib/api";

export function useWebChatSettings() {
  return useQuery({
    queryKey: ["shop", "web-chat"],
    queryFn: () => apiFetch<WebChatSettings>("/shop/web-chat"),
    staleTime: Infinity,
  });
}
