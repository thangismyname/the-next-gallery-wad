// Header của khu làm việc riêng (Admin, Developer): mở/thu sidebar + theme/ngôn ngữ · tên app + badge · slot phải.
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/toggles/ThemeToggle";
import { LanguageToggle } from "@/components/toggles/LanguageToggle";
import { UserMenu } from "@/features/navigation/UserMenu";

export function WorkspaceHeader({ badge, right }: { badge: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur md:px-6">
      {/* Trái: thu gọn / mở sidebar (sheet trên mobile) + mode/language toggle */}
      <div className="flex items-center gap-1">
        <SidebarTrigger />
        <ThemeToggle />
        <LanguageToggle />
      </div>

      {/* Giữa: tên + badge */}
      <div className="flex items-center justify-center gap-3">
        <span className="font-mono text-sm uppercase tracking-[0.2em] whitespace-nowrap">
          The Next Gallery
        </span>
        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
          {badge}
        </Badge>
      </div>

      {/* Phải: tìm nhanh (⌘K) + avatar = bảng tài khoản như app chính; quay lại app ở đáy sidebar */}
      <div className="flex items-center justify-end gap-1 sm:gap-2">
        {right}
        <UserMenu />
      </div>
    </header>
  );
}
