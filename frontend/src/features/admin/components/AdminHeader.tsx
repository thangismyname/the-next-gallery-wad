// src/features/admin/components/AdminHeader.tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { AdminSearch } from "./AdminSearch";

interface AdminHeaderProps {
  onMenuClick?: () => void;
}

export function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur md:px-6">
      {/* Trái: nút mở sidebar (mobile) + mode/language toggle */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
          <span className="sr-only">{t("admin.header.openSidebar")}</span>
        </Button>
        <ThemeToggle />
        <LanguageToggle />
      </div>

      {/* Giữa: tên + badge */}
      <div className="flex items-center justify-center gap-3">
        <span className="font-mono text-sm uppercase tracking-[0.2em] whitespace-nowrap">
          The Next Gallery
        </span>
        <Badge
          variant="outline"
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
        >
          {t("admin.badge")}
        </Badge>
      </div>

      {/* Phải: tìm nhanh (⌘K) + back to gallery */}
      <div className="flex items-center justify-end gap-1 sm:gap-2">
        <AdminSearch />
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/gallery">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("admin.header.backToGallery")}
            </span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
