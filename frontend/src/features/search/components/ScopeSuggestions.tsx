import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SearchScope } from "../searchScope";
import { ScopeIcon } from "./ScopeIcon";

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** Danh sách "Tìm trong …" khi chữ đang gõ khớp 1 phạm vi. */
export const ScopeSuggestions: React.FC<{
  suggestions: SearchScope[];
  active: SearchScope | undefined;
  onHover: (s: SearchScope) => void;
  onPick: (s: SearchScope) => void;
}> = ({ suggestions, active, onHover, onPick }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-4">
      <div className="mb-2 px-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        {t("search.scope.searchIn")}
      </div>
      <div className="space-y-0.5">
        {suggestions.map((s) => (
          <button
            key={s.key}
            onMouseEnter={() => onHover(s)}
            aria-selected={s === active}
            type="button"
            disabled={s.disabled}
            onClick={() => onPick(s)}
            onMouseDown={keepFocus}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm transition-colors",
              s.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent/50",
              s === active && "bg-accent/60",
            )}
          >
            <span className="flex size-6 items-center justify-center">
              <ScopeIcon scope={s} />
            </span>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-xs text-muted-foreground">
              {s.disabled ? t("search.scope.soon") : t(`search.scope.kind.${s.kind}`)}
            </span>
            {s === active && (
              <kbd className="hidden h-5 items-center rounded-md bg-muted/70 px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                Tab
              </kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Màn hình trống: gợi ý cách tìm + chọn nhanh phạm vi (Yêu thích + nhãn; album: gõ tên). */
export const ScopeQuickPicks: React.FC<{ scopes: SearchScope[]; onPick: (s: SearchScope) => void }> = ({
  scopes,
  onPick,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center text-sm text-muted-foreground">
      <p>{t("search.hint")}</p>
      <div className="flex max-w-md flex-wrap justify-center gap-1.5">
        {scopes
          .filter((s) => s.kind !== "album")
          .map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={s.disabled}
              onClick={() => onPick(s)}
              onMouseDown={keepFocus}
              title={s.disabled ? t("search.scope.soon") : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 px-2.5 text-xs transition-colors",
                s.disabled ? "cursor-not-allowed opacity-50" : "hover:border-border hover:text-foreground",
              )}
            >
              <ScopeIcon scope={s} />
              {s.name}
              {s.disabled && (
                <span className="font-mono text-[9px] tracking-widest uppercase">{t("search.scope.soon")}</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
};
