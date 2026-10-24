"use client";

import { useRealtimeConnected } from "@/lib/realtime-store";
import { cn } from "@/lib/utils";

export function RealtimeStatus() {
  const connected = useRealtimeConnected();
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", connected ? "bg-green-500" : "bg-gray-400")} />
      {connected ? "Cập nhật trực tiếp" : "Cập nhật định kỳ"}
    </div>
  );
}
