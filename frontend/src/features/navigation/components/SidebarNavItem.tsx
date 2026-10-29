import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { NavMenuItem } from "@/types";
import { isNavActive } from "@/hooks/useNavItems";

interface SidebarNavItemProps {
  item: NavMenuItem;
  size?: "default" | "sm" | "lg";
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  item,
  size = "default",
}) => {
  const Icon = item.icon;
  const location = useLocation();
  // Khớp cả trang con: /albums/abc vẫn sáng mục "Album".
  const isActive = isNavActive(item.to, location.pathname);
  const badge = item.badge && item.badge > 0 ? item.badge : null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        size={size}
        className="[&>span]:group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto!"
      >
        <NavLink
          to={item.to}
          onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
        >
          <Icon />
          <span className="flex flex-1 items-center justify-between gap-2">
            {item.label}
            {badge && (
              <Badge className="h-4 min-w-4 px-1 text-[9px]" variant="secondary">
                {badge}
              </Badge>
            )}
          </span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
