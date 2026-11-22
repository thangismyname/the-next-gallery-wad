import React from "react";
import { useTranslation } from "react-i18next";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useNavItems } from "@/features/navigation/useNavItems";
import { useResizable } from "@/features/navigation/useResizable";
import { SidebarNavItem } from "./components/SidebarNavItem";
import { ThemeToggle } from "@/components/toggles/ThemeToggle";
import { LanguageToggle } from "@/components/toggles/LanguageToggle";
import type { NavMenuItem } from "./types";

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
  const { onMouseDown } = useResizable();
  const menuItems = useNavItems();
  const { system: pinned = [], ...grouped } = groupBySection(menuItems);
  const isCollapsed = state === "collapsed";

  return (
    <SidebarPrimitive
      collapsible="icon"
      // Nằm dưới header (h-16) → cao = màn hình − header; để mặc định h-svh
      // thì đáy sidebar (Thùng rác, toggle) thò khỏi mép dưới màn hình 4rem.
      className="top-16 h-[calc(100svh-4rem)] border-r border-border bg-sidebar"
    >
      <SidebarContent className="items-center">
        {/* Gọn: tên app đã có trên Header → không lặp ở đầu sidebar; nhóm cách nhau bằng nhãn, không kẻ vạch. */}
        {Object.entries(grouped).map(([section, items]) => (
          <React.Fragment key={section}>
            <SidebarGroup className="py-1">
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
        {/* Mục section "system" ghim dưới cùng: Quản trị (chỉ admin) */}
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
