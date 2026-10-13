"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FlaskConical,
  Inbox,
  LogOut,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HealthStatus } from "@/components/health-status";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useLogout } from "@/lib/auth";
import { useUnreadConversationCount } from "@/lib/conversations";
import { cn } from "@/lib/utils";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/inbox", label: "Hộp thư", icon: Inbox },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/products", label: "Sản phẩm", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/simulator", label: "Giả lập khách", icon: FlaskConical },
];

export function Sidebar() {
  const { data: unreadCount } = useUnreadConversationCount();
  const unread = unreadCount ?? 0;
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-gray-200 bg-white p-4">
      <div>
        <div className="mb-6 px-2 text-lg font-bold">Chat2Order</div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                  active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {href === "/inbox" && unread > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 px-2">
        {user && (
          <div className="text-sm">
            <div className="truncate font-medium">{user.name}</div>
            <div className="truncate text-xs text-gray-500">{user.shopName}</div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </Button>
        <HealthStatus />
      </div>
    </aside>
  );
}
