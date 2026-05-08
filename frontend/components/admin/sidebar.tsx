"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Monitor,
  Printer,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Pengguna", icon: Users },
  { href: "/counters", label: "Loket", icon: Settings },
  { href: "/layanans", label: "Layanan", icon: Briefcase },
  { href: "/displays", label: "Display", icon: Monitor },
  { href: "/printers", label: "Printer", icon: Printer },
  { href: "/audit", label: "Audit Log", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">
            Antrian Digital
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

          const linkContent = (
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive &&
                  "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                collapsed && "justify-center",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={href}>
                <TooltipTrigger>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          }

          return <div key={href}>{linkContent}</div>;
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="p-3">
        {!collapsed && (
          <p className="text-xs text-muted-foreground">
            v1.0.0 &middot; Sistem Antrian
          </p>
        )}
      </div>
    </aside>
  );
}
