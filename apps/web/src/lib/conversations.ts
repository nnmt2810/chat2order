"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import type {
  ConversationDto,
  ConversationListResponse,
  MessageDto,
  MessageListResponse,
  SimulatedMessageInput,
} from "@chat2order/shared/conversation";
import type { CustomerInput } from "@chat2order/shared/customer";
import { ApiError, apiFetch } from "@/lib/api";
import { useRealtimeConnected } from "@/lib/realtime-store";

export type ConversationListParams = {
  q: string;
  unread: boolean;
  page: number;
  pageSize: number;
};

const LIST_KEY = ["conversation-list"] as const;
const REALTIME_BACKSTOP_MS = 60_000;

function pollInterval(realtimeConnected: boolean, fallbackMs: number): number {
  return realtimeConnected ? REALTIME_BACKSTOP_MS : fallbackMs;
}

export function invalidateConversationData(queryClient: QueryClient, conversationId?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    queryClient.invalidateQueries({
      queryKey: conversationId ? ["conversation", conversationId] : ["conversation"],
    }),
  ]);
}

export function useConversations(params: ConversationListParams) {
  const realtimeConnected = useRealtimeConnected();
  return useQuery({
    queryKey: [...LIST_KEY, "list", params],
    queryFn: () => {
      const search = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        unread: String(params.unread),
      });
      if (params.q) search.set("q", params.q);
      return apiFetch<ConversationListResponse>(`/conversations?${search.toString()}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: pollInterval(realtimeConnected, 5000),
  });
}

// Số hội thoại có tin chưa đọc, hiện thành chấm đỏ ở thanh bên
export function useUnreadConversationCount() {
  const realtimeConnected = useRealtimeConnected();
  return useQuery({
    queryKey: [...LIST_KEY, "unread-count"],
    queryFn: async () =>
      (await apiFetch<ConversationListResponse>("/conversations?unread=true&pageSize=1")).total,
    refetchInterval: pollInterval(realtimeConnected, 10_000),
  });
}

export function useConversation(id: string) {
  const realtimeConnected = useRealtimeConnected();
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: async () =>
      (await apiFetch<{ conversation: ConversationDto }>(`/conversations/${id}`)).conversation,
    // Không thăm dò tiếp khi đã lỗi (ví dụ 404), và không thử lại khi hội thoại không tồn tại
    refetchInterval: (query) =>
      query.state.status === "error" ? false : pollInterval(realtimeConnected, 5000),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });
}

export function useMessages(conversationId: string) {
  const realtimeConnected = useRealtimeConnected();
  return useInfiniteQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ limit: "50" });
      if (pageParam) search.set("before", pageParam);
      return apiFetch<MessageListResponse>(
        `/conversations/${conversationId}/messages?${search.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.items[0]?.id : undefined),
    refetchInterval: pollInterval(realtimeConnected, 3000),
  });
}

// Trang đầu tiên là trang mới nhất, nên đảo thứ tự các trang để tin cũ nằm trên cùng
export function flattenMessagePages(pages: MessageListResponse[] | undefined): MessageDto[] {
  const seen = new Set<string>();
  const result: MessageDto[] = [];
  for (const page of [...(pages ?? [])].reverse()) {
    for (const message of page.items) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        result.push(message);
      }
    }
  }
  return result;
}

export function latestInboundId(messages: MessageDto[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message && message.direction === "INBOUND") return message.id;
  }
  return undefined;
}

export function useMarkConversationRead(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>(`/conversations/${conversationId}/read`, { method: "POST" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId], exact: true }),
      ]),
  });
}

export function useSimulateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SimulatedMessageInput) =>
      apiFetch<{ conversation: ConversationDto; message: MessageDto }>("/simulator/messages", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: ["conversation"] }),
      ]),
  });
}

function useInvalidateConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LIST_KEY }),
      // Khóa tiền tố: làm mới cả hội thoại lẫn danh sách tin nhắn của nó
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
    ]);
}

export function useReplyToConversation(conversationId: string) {
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<{ message: MessageDto }>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSettled: invalidate,
  });
}

// customerId = null để gỡ liên kết
export function useLinkCustomer(conversationId: string) {
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: (customerId: string | null) =>
      apiFetch<{ conversation: ConversationDto }>(`/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ customerId }),
      }),
    onSettled: invalidate,
  });
}

export function useCreateCustomerFromConversation(conversationId: string) {
  const invalidate = useInvalidateConversation(conversationId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiFetch<{ conversation: ConversationDto }>(`/conversations/${conversationId}/customer`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    // Danh sách khách hàng cũng đổi vì có thêm một khách mới
    onSettled: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: ["customers"] })]),
  });
}
