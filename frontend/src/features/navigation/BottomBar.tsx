// features/navigation/BottomBar.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { useSelectionStore } from "@/hooks/useSelectionStore";
import { BottomBarNav } from "./components/BottomBarNav";
import { BottomBarSelectionActions } from "./components/BottomBarSelection";
import { cn } from "@/lib/utils";
import { floatingSwap } from "@/lib/motion";

interface BottomBarProps {
  onShare: (ids: string[]) => void;
  onDownload: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onFavorite: (ids: string[]) => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  onShare,
  onDownload,
  onDelete,
  onFavorite,
}) => {
  const { t } = useTranslation();
  const isSelecting = useSelectionStore((s) => s.isSelecting);

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
      <AnimatePresence mode="wait" initial={false}>
        {isSelecting ? (
          <motion.div
            key="selection"
            {...floatingSwap}
          >
            <BottomBarSelectionActions
              onShare={onShare}
              onDownload={onDownload}
              onDelete={onDelete}
              onFavorite={onFavorite}
            />
          </motion.div>
        ) : (
          <motion.div
            key="nav"
            {...floatingSwap}
          >
            <BottomBarNav />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
