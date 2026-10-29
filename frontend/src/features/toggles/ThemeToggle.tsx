// features/theme/components/ThemeToggle.tsx
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Moon, Sun } from "lucide";
import { MorphIcon } from "morphicons/react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { changeThemeWithTransition } from "@/utils/themeTransition";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    changeThemeWithTransition(() => setTheme(nextTheme), buttonRef.current);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="icon"
          className={cn("hidden sm:inline-flex", className)}
          onClick={handleToggle}
          aria-label={t("header.toggleTheme", "Toggle theme")}
        >
          <MorphIcon icon={theme === "dark" ? Moon : Sun} size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("header.toggleTheme", "Toggle theme")}</TooltipContent>
    </Tooltip>
  );
}
