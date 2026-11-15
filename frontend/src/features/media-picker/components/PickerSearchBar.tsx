// Ô tìm của picker — cùng "bộ não" với Spotlight:
// - Gõ tên nhãn / album / "fav" / tên màu nhãn / tên tag AI (vi·en·ja) → gợi ý,
//   ↑↓ chọn, Tab / Enter → thành chip phạm vi trong ô; Backspace ở đầu ô gỡ chip.
// - Cú pháp tắt "fav.chó" / "in ảnh.biển" → chip + phần còn lại.
// - Chữ còn lại = search kết hợp (CLIP + tag + vật thể) trong phạm vi.
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseScopedQuery, type SearchScope } from "@/features/search/searchScope";
import { lensName, type Lens, type Suggestion } from "../lens";
import { LensIcon } from "./LensIcon";

interface PickerSearchBarProps {
  text: string;
  onTextChange: (text: string) => void;
  /** Chip trong ô (phạm vi / tag); null = không có. */
  chip: Lens | null;
  onPick: (lens: Lens, rest?: string) => void;
  onClearChip: () => void;
  suggestions: Suggestion[];
  scopes: SearchScope[];
}

export const PickerSearchBar: React.FC<PickerSearchBarProps> = ({
  text,
  onTextChange,
  chip,
  onPick,
  onClearChip,
  suggestions,
  scopes,
}) => {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  // Chèn / gỡ chip (Tab, Enter, bấm gợi ý) → bộ gõ tiếng Việt chốt chữ và có
  // thể làm ô mất focus; đặt lại con trỏ cuối ô ở frame sau (giống Spotlight).
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = () =>
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  const pick = (lens: Lens, rest?: string) => {
    onPick(lens, rest);
    refocus();
  };
  const clearChip = () => {
    onClearChip();
    refocus();
  };
  const [focused, setFocused] = useState(false);
  const shown = focused && !chip ? suggestions : [];
  const current = shown[Math.min(active, shown.length - 1)];

  const change = (value: string) => {
    setActive(0);
    const parsed = chip ? null : parseScopedQuery(value, scopes);
    if (parsed) pick({ kind: "scope", scope: parsed.scope }, parsed.rest);
    else onTextChange(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && shown.length) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, shown.length - 1) + step + shown.length) % shown.length);
    } else if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && current) {
      e.preventDefault();
      pick(current.lens);
    } else if (e.key === "Backspace" && chip && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      clearChip();
    }
  };

  return (
    <div className="relative">
      <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 focus-within:ring-2 focus-within:ring-ring/40">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        {chip && (
          <span className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
            <LensIcon lens={chip} />
            <span className="truncate">{lensName(chip)}</span>
            <button
              type="button"
              onClick={clearChip}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={t("mediaPicker.clearScope")}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={chip ? t("mediaPicker.searchInScope") : t("mediaPicker.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              onTextChange("");
              refocus();
            }}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={t("mediaPicker.clearSearch")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
          {shown.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s.lens)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  s === current && "bg-accent",
                )}
              >
                <span className="flex size-5 items-center justify-center">
                  <LensIcon lens={s.lens} />
                </span>
                <span className="min-w-0 flex-1 truncate">{lensName(s.lens)}</span>
                <span className="text-xs text-muted-foreground">
                  {s.lens.kind === "tag" ? t("mediaPicker.kindTag") : t(`search.scope.kind.${s.lens.kind === "scope" ? s.lens.scope.kind : ""}`)}
                </span>
                {s === current && (
                  <kbd className="hidden rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">Tab</kbd>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
