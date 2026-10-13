"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { channelLabels } from "@chat2order/shared/conversation";
import { SearchBox } from "@/components/common/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/lib/conversations";
import { formatListTime } from "@/lib/format";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";

const PAGE_STEP = 30;
const PAGE_MAX = 100;

export function ConversationList() {
  const params = useParams<{ id?: string }>();
  const activeId = params.id;

  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_STEP);

  const q = useDebounce(search.trim());
  const { data, error, isPending, refetch } = useConversations({
    q,
    unread: unreadOnly,
    page: 1,
    pageSize,
  });

  const hasMore = data ? data.total > data.items.length : false;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-3">
        <h1 className="text-lg font-bold">Hộp thư</h1>
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPageSize(PAGE_STEP);
          }}
          placeholder="Tìm theo tên khách"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              setPageSize(PAGE_STEP);
            }}
          />
          Chỉ hiện tin chưa đọc
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending && <p className="p-3 text-sm text-muted-foreground">Đang tải...</p>}

        {error && !data && (
          <div className="space-y-2 p-3">
            <p className="text-sm text-red-600">Không tải được danh sách: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">
            {q
              ? "Không tìm thấy hội thoại phù hợp."
              : unreadOnly
                ? "Không có tin nhắn chưa đọc."
                : "Chưa có hội thoại nào. Dùng trang Giả lập khách để tạo tin nhắn thử."}
          </p>
        )}

        {data && data.items.length > 0 && (
          <nav aria-label="Danh sách hội thoại">
            <ul>
              {data.items.map((conversation) => {
                const active = conversation.id === activeId;
                const unread = conversation.unreadCount;
                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/inbox/${conversation.id}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block border-b px-3 py-3 hover:bg-accent",
                        active && "bg-accent",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread > 0 ? "font-semibold" : "font-medium",
                          )}
                        >
                          {conversation.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatListTime(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {conversation.lastMessagePreview}
                        </span>
                        {unread > 0 && (
                          <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {channelLabels[conversation.channel]}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {hasMore && pageSize < PAGE_MAX && (
          <div className="p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setPageSize((current) => Math.min(current + PAGE_STEP, PAGE_MAX))}
            >
              Xem thêm
            </Button>
          </div>
        )}

        {hasMore && pageSize >= PAGE_MAX && (
          <p className="p-3 text-xs text-muted-foreground">
            Chỉ hiện {PAGE_MAX} hội thoại gần nhất. Gõ tên khách để thu hẹp tìm kiếm.
          </p>
        )}
      </div>
    </div>
  );
}
