// features/navigation/BottomBar.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { BottomBarNav } from "./components/BottomBarNav";
import { cn } from "@/lib/utils";

export const BottomBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("navigation.bottomBar.ariaLabel")}
      className={cn(
        "fixed z-40",
        "sm:hidden",
        "bottom-4 left-1/2 -translate-x-1/2",
        "mb-[env(safe-area-inset-bottom)]",
      )}
    >
      <BottomBarNav />
    </nav>
  );
};
