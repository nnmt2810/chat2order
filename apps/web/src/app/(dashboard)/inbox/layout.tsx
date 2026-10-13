import type { ReactNode } from "react";
import { ConversationList } from "@/components/inbox/conversation-list";

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-120 gap-4">
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-card">
        <ConversationList />
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
