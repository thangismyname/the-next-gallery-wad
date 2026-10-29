import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useNavItems } from "@/hooks/useNavItems";
import { useResizable } from "@/hooks/useResizable";
import { SidebarNavItem } from "./components/SidebarNavItem";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { NavMenuItem } from "@/types";
import { House } from "lucide-react";

// Tiêu đề nhóm (Thùng rác ghim ở footer; Trang chủ = header của sidebar).
const SECTION_LABEL_KEYS: Record<string, string> = {
  photos: "sidebar.photos",
  ai: "sidebar.ai",
  social: "sidebar.social",
};

function groupBySection(items: NavMenuItem[]) {
  return items.reduce<Record<string, NavMenuItem[]>>((acc, item) => {
    const key = item.section ?? "default";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { state, isMobile } = useSidebar();
  const { width, onMouseDown } = useResizable();
  const menuItems = useNavItems();
  const { system: pinned = [], ...grouped } = groupBySection(menuItems);
  const isCollapsed = state === "collapsed";
  useEffect(() => {
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    if (wrapper) {
      (wrapper as HTMLElement).style.setProperty(
        "--sidebar-width",
        `${width}px`,
      );
    }
  }, [width]);

  return (
    <SidebarPrimitive
      collapsible="icon"
      // Nằm dưới header (h-16) → cao = màn hình − header; để mặc định h-svh
      // thì đáy sidebar (Thùng rác, toggle) thò khỏi mép dưới màn hình 4rem.
      className="top-16 h-[calc(100svh-4rem)] border-r border-border bg-sidebar"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="[&>div]:group-data-[collapsible=icon]:hidden"
            >
              {/* Header sidebar = nút về Trang chủ (không lặp mục "Trang chủ" trong danh sách) */}
              <Link to="/" aria-label={t("sidebar.home")}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <House className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {t("app.name")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("app.tagline", "AI Photo Gallery")}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="items-center">
        {Object.entries(grouped).map(([section, items], idx) => (
          <React.Fragment key={section}>
            {idx > 0 && <SidebarSeparator />}
            <SidebarGroup>
              {!isCollapsed && SECTION_LABEL_KEYS[section] && (
                <SidebarGroupLabel>
                  {t(SECTION_LABEL_KEYS[section])}
                </SidebarGroupLabel>
              )}
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarNavItem key={item.to} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </React.Fragment>
        ))}
      </SidebarContent>

      {/* Drag handle — chỉ hiện khi expanded */}
      {!isCollapsed && (
        <div
          onMouseDown={onMouseDown}
          className="group/drag absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border"
        />
      )}

      <SidebarFooter className="gap-3 border-t border-border/60 px-2 pt-3 pb-4">
        {/* Thùng rác ghim dưới cùng, tách khỏi các nhóm chính */}
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          {pinned.map((item) => (
            <SidebarNavItem key={item.to} item={item} />
          ))}
        </SidebarMenu>
        {/* Toggle CHỈ trong menu trượt mobile (header ẩn toggle trên điện
            thoại). Tablet / laptop đã có toggle trên header → không lặp lại. */}
        {isMobile && (
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center justify-center gap-1 px-2">
                <ThemeToggle className="inline-flex" />
                <LanguageToggle className="inline-flex" />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </SidebarPrimitive>
  );
};
