"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Inbox, LogOut, Package, Users, type LucideIcon } from "lucide-react";
import { HealthStatus } from "@/components/health-status";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/inbox", label: "Hộp thư", icon: Inbox },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/products", label: "Sản phẩm", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
];

export function Sidebar() {
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
                {label}
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
