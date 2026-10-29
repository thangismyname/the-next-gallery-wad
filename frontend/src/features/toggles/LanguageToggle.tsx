import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, toLanguageCode } from "@/lib/languages";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  className?: string;
}

/** Nút quả địa cầu → menu sổ xuống chọn ngôn ngữ (danh sách ở lib/languages). */
export function LanguageToggle({ className }: LanguageToggleProps) {
  const { t, i18n } = useTranslation();
  const current = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("hidden sm:inline-flex", className)}
              aria-label={t("header.toggleLanguage")}
            >
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("header.toggleLanguage")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>
          {t("settings.appearance.language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(lng) => void i18n.changeLanguage(lng)}
        >
          {LANGUAGES.map((lang) => (
            <DropdownMenuRadioItem key={lang.code} value={lang.code}>
              <span className="flex-1">{lang.label}</span>
              <span className="text-xs text-muted-foreground">
                {lang.short}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
