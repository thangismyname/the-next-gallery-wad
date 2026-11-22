// Sidebar của khu làm việc riêng (Admin, Developer) — cùng shadcn Sidebar với MainLayout (thu gọn thành
// icon, sheet trên mobile, mở/đóng bằng SidebarTrigger trên WorkspaceHeader, kéo mép để đổi rộng). Đáy: quay lại app.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/toggles/ThemeToggle";
import { LanguageToggle } from "@/components/toggles/LanguageToggle";
import { SidebarNavItem } from "@/features/navigation/components/SidebarNavItem";
import { useResizable } from "@/features/navigation/useResizable";
import type { NavMenuItem } from "@/features/navigation/types";

export function WorkspaceSidebar({
  label,
  items,
  storageKey,
  switchTo,
}: {
  label: string;
  items: NavMenuItem[];
  /** localStorage key của chiều rộng (mỗi khu lưu riêng). */
  storageKey: string;
  /** Nút sang khu làm việc kia (Admin ↔ Developer), ghim ở đáy. */
  switchTo?: NavMenuItem;
}) {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { onMouseDown } = useResizable(storageKey);

  return (
    <Sidebar
      collapsible="icon"
      // Dưới WorkspaceHeader (h-14) → cao = màn hình − header (như MainLayout với h-16).
      className="top-14 h-[calc(100svh-3.5rem)] border-r border-border bg-sidebar"
    >
      <SidebarContent className="items-center">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarNavItem key={item.to} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Kéo mép phải để đổi rộng (như sidebar chính) — chỉ khi đang mở */}
      {state === "expanded" && (
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 right-0 z-20 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border"
        />
      )}

      <SidebarFooter className="gap-3 border-t border-border/60 px-2 pt-3 pb-4">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          {switchTo && <SidebarNavItem item={switchTo} />}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={t("admin.header.backToApp")}
              className="[&>span]:group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto!"
            >
              <Link to="/gallery" onClick={() => isMobile && setOpenMobile(false)}>
                <ArrowLeft />
                <span>{t("admin.header.backToApp")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Toggle chỉ trong sheet mobile (header ẩn toggle trên điện thoại) */}
        {isMobile && (
          <div className="flex items-center justify-center gap-1 px-2">
            <ThemeToggle className="inline-flex" />
            <LanguageToggle className="inline-flex" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
