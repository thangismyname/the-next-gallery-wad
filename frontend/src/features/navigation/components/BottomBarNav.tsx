// features/navigation/components/BottomBarNav.tsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { isNavActive, useNavItems } from "@/hooks/useNavItems";
import { cn } from "@/lib/utils";

// Mục ở vị trí này là nút Camera tròn nổi giữa thanh.
const CENTER = 2;

/**
 * Thanh điều hướng mobile: Thư viện · Album · (Camera) · Moment · AI Studio.
 * Chỉ mục đang mở hiện nhãn chữ → vừa cả màn 320px; Moment có chấm báo lời mời.
 */
export const BottomBarNav: React.FC = () => {
  const { pathname } = useLocation();
  const items = useNavItems()
    .filter((item) => item.bottomBar !== undefined)
    .sort((a, b) => a.bottomBar! - b.bottomBar!);

  return (
    <div className="glass flex items-center gap-0.5 rounded-full p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(item.to, pathname);

        if (item.bottomBar === CENTER) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "mx-0.5 flex size-10 shrink-0 items-center justify-center rounded-full",
                "bg-foreground text-background shadow-lg shadow-black/20 transition-transform active:scale-95",
                active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <Icon className="size-[18px]" />
            </NavLink>
          );
        }

        return (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={cn(
              "relative flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-all duration-300",
              active
                ? "bg-primary px-3 text-primary-foreground shadow-md shadow-primary/25"
                : "w-9 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {active && <span className="max-w-24 truncate">{item.label}</span>}
            {!!item.badge && !active && (
              <span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </NavLink>
        );
      })}
    </div>
  );
};
