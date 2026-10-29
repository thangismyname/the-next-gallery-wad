// src/features/admin/components/AdminSidebar.tsx
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Code2, LayoutDashboard, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { useAdminDeveloperRequests } from "@/hooks/useAdminDeveloperRequests";
import type { AdminNavItem } from "@/types";

const navItems: AdminNavItem[] = [
  { key: "dashboard", to: "/admin", icon: LayoutDashboard, end: true },
  { key: "users", to: "/admin/users", icon: Users },
  { key: "developer", to: "/admin/developer", icon: Code2 },
] as const;

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  // Số yêu cầu Developer đang chờ → badge cạnh mục "Yêu cầu Developer".
  const { pending } = useAdminDeveloperRequests();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {navItems.map(({ key, to, icon: Icon, end }) => (
        <NavLink
          key={key}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              isActive && "bg-muted font-medium text-foreground",
            )
          }
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{t(`admin.nav.${key}`)}</span>
          {key === "developer" && pending.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary-foreground tabular-nums">
              {pending.length}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Desktop: aside cố định, luôn hiện, không có toggles */}
      <aside className="hidden w-56 shrink-0 border-r border-border/50 bg-background md:flex md:flex-col">
        <AdminNav />
      </aside>

      {/* Mobile: backdrop. Khi mở KHÔNG ép pointer-events-auto: menu Radix
          (chọn ngôn ngữ) đặt body pointer-events:none, backdrop phải kế thừa
          theo — nếu không, cú chạm mở menu "rơi" xuống backdrop và đóng drawer. */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile: drawer trượt, có toggles ở dưới cùng */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/50 bg-background transition-transform duration-200 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
          <span className="font-mono text-sm uppercase tracking-[0.2em]">
            {t("admin.badge")}
          </span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">{t("admin.header.closeSidebar")}</span>
          </Button>
        </div>

        <AdminNav onNavigate={onClose} />

        {/* Toggle mặc định ẩn dưới sm (header cũng ẩn chúng trên mobile) →
            ép hiện trong drawer; từ sm trở lên header đã có nên ẩn ở đây. */}
        <div className="flex items-center justify-center gap-2 border-t border-border/50 p-3 sm:hidden">
          <ThemeToggle className="inline-flex" />
          <LanguageToggle className="inline-flex" />
        </div>
      </aside>
    </>
  );
}
