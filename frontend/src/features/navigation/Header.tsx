import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchView } from "@/features/search/SearchView";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { SearchTrigger } from "@/features/search/components/SearchTrigger";
import { UserMenu } from "@/features/users/UserMenu";

export const Header: React.FC = () => {
  const { t } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useKeyboardShortcut({ key: "k" }, () => setIsSearchOpen((prev) => !prev));

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <header className="h-16 bg-background/80 backdrop-blur px-4 sm:px-6 sticky top-0 z-50 flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger />
              </TooltipTrigger>
              <TooltipContent>
                {t("header.toggleSidebar", "Toggle sidebar")}
              </TooltipContent>
            </Tooltip>

            <ThemeToggle />
            <LanguageToggle />
          </div>

          {/* Center: Logo — thu nhỏ trên điện thoại để không đè nút search /
              avatar; max-w chừa đủ chỗ 2 bên (≈ 2 × 5.75rem) phòng màn rất hẹp. */}
          <Link
            to="/"
            className="absolute left-1/2 max-w-[calc(100%-11.5rem)] -translate-x-1/2 truncate whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.15em] text-foreground transition-opacity hover:opacity-80 min-[400px]:text-xs min-[400px]:tracking-[0.2em] sm:max-w-none sm:text-base"
          >
            {t("app.name")}
          </Link>

          {/* Right */}
          <div className="flex items-center gap-2 sm:gap-3">
            <SearchTrigger onOpen={() => setIsSearchOpen(true)} />
            <UserMenu />
          </div>
        </header>
      </TooltipProvider>

      <SearchView open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};
