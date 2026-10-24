"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_URL } from "@/lib/api";
import { invalidateConversationData } from "@/lib/conversations";
import { setRealtimeConnected } from "@/lib/realtime-store";

function readConversationId(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "conversationId" in payload &&
    typeof payload.conversationId === "string"
  ) {
    return payload.conversationId;
  }
  return undefined;
}

// Mở kết nối realtime khi đã đăng nhập, và làm mới đúng dữ liệu khi có thay đổi
export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Cookie đăng nhập được gửi kèm; máy chủ xác thực bằng cookie đó
    const socket = io(API_URL, { withCredentials: true });

    socket.on("connect", () => {
      setRealtimeConnected(true);
      // Có thể đã lỡ sự kiện lúc mất kết nối: tải lại toàn bộ dữ liệu hội thoại
      void invalidateConversationData(queryClient);
    });
    socket.on("disconnect", () => setRealtimeConnected(false));
    socket.on("connect_error", () => setRealtimeConnected(false));
    socket.on("conversation:changed", (payload: unknown) => {
      void invalidateConversationData(queryClient, readConversationId(payload));
    });

    return () => {
      socket.disconnect();
      setRealtimeConnected(false);
    };
  }, [queryClient]);

  return null;
}
