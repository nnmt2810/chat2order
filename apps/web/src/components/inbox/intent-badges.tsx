import { intentLabels, type IntentType } from "@chat2order/shared/conversation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles: Record<IntentType, string> = {
  ORDER:
    "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  ORDER_CHANGE:
    "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  ORDER_STATUS:
    "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  FAQ: "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
  COMPLAINT:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  CONFIRMATION:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  OTHER:
    "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
};

export function IntentBadge({ type, className }: { type: IntentType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", styles[type], className)}>
      {intentLabels[type]}
    </Badge>
  );
}

// Ở danh sách ẩn nhãn "Khác" (chào hỏi, cảm ơn) cho đỡ rối; thẻ chi tiết vẫn hiện đủ
export function IntentBadges({ intents, max = 2 }: { intents: IntentType[]; max?: number }) {
  const meaningful = intents.filter((type) => type !== "OTHER");
  const shown = meaningful.slice(0, max);
  const hidden = meaningful.length - shown.length;

  return (
    <>
      {shown.map((type) => (
        <IntentBadge key={type} type={type} />
      ))}
      {hidden > 0 && (
        <Badge variant="outline" className="text-[10px]">
          +{hidden}
        </Badge>
      )}
    </>
  );
}

export function NeedsAttentionBadge() {
  return (
    <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold leading-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      Cần người xem
    </span>
  );
}
