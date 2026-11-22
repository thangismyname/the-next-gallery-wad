// features/navigation/BottomBar.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { BottomBarNav } from "./components/BottomBarNav";
import { cn } from "@/lib/utils";
import { useHideOnScroll } from "./useHideOnScroll";

export const BottomBar: React.FC = () => {
  const { t } = useTranslation();
  // Slides away while scrolling down; Moments (snap pager, laid out around the bar) keeps it.
  const hidden = useHideOnScroll(!useLocation().pathname.startsWith("/moments"));

  return (
    <nav
      aria-label={t("navigation.bottomBar.ariaLabel")}
      className={cn(
        "fixed z-40",
        "sm:hidden",
        "bottom-4 left-1/2 -translate-x-1/2",
        "mb-[env(safe-area-inset-bottom)]",
        "transition-transform duration-300 ease-out motion-reduce:transition-none",
        hidden && "translate-y-[calc(100%+2rem+env(safe-area-inset-bottom))]",
      )}
    >
      <BottomBarNav />
    </nav>
  );
};
