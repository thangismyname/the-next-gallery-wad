// Picker ảnh / video trong thư viện — nhúng được vào dialog bất kỳ (Moments)
// hoặc dùng qua MediaPickerDialog / pickMedia(). Controlled: cha giữ lựa chọn.
// - Ô tìm như Spotlight: gợi ý nhãn / album / yêu thích / màu nhãn / tag AI
//   (Tab chọn → chip), chữ còn lại = search kết hợp trong phạm vi đó.
// - Chip: loại (tất cả/ảnh/video/yêu thích/đã chọn) + nhãn + tag AI kèm số ảnh.
// - Shift+click: chọn / bỏ cả dải (cần `onToggleMany`).
// - `max`: đủ số ảnh → khoá các ô còn lại (max = 1 do cha tự thay lựa chọn).
import { type MediaFilter, type MediaListItem } from "@tng/shared";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { PickerGrid } from "./components/PickerGrid";
import { PickerLensBar } from "./components/PickerLensBar";
import { PickerSearchBar } from "./components/PickerSearchBar";
import { lensKey, usePickerSuggestions, type Lens } from "./lens";
import { useMediaPickerQuery } from "./useMediaPickerQuery";

export interface MediaPickerProps {
  selectedIds: ReadonlySet<string>;
  onToggle: (item: MediaListItem) => void;
  /** Shift+click → chọn (`select = true`) / bỏ chọn cả dải. */
  onToggleMany?: (items: MediaListItem[], select: boolean) => void;
  /** Ảnh đã chọn theo thứ tự — có thì hiện chip "Đã chọn" để xem lại. */
  selectedItems?: MediaListItem[];
  max?: number;
  /** Hiện "đã chọn/max" (tắt khi nơi nhúng tự hiển thị bộ đếm). */
  showCount?: boolean;
  initialFilter?: MediaFilter;
  /** Class cho khung cuộn (chiều cao), vd "h-[55vh]". */
  gridClassName?: string;
  className?: string;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({
  selectedIds,
  onToggle,
  onToggleMany,
  selectedItems,
  max,
  showCount = true,
  initialFilter = "all",
  gridClassName,
  className,
}) => {
  const { t } = useTranslation();
  const [lens, setLens] = useState<Lens>({ kind: "filter", filter: initialFilter });
  const [text, setText] = useState("");
  const debounced = useDebounce(text, 350);
  const { suggestions, scopes, tags } = usePickerSuggestions(text, true);
  const query = useMediaPickerQuery(lens.kind === "selected" ? { kind: "filter", filter: "all" } : lens, lens.kind === "selected" ? "" : debounced);

  const showingSelected = lens.kind === "selected" && selectedItems;
  const items = showingSelected ? selectedItems : query.items;
  const locked = max !== undefined && max > 1 && selectedIds.size >= max;
  const chip = lens.kind === "scope" || lens.kind === "tag" ? lens : null;

  // Hết ảnh đã chọn khi đang xem "Đã chọn" → quay về tất cả.
  useEffect(() => {
    if (lens.kind === "selected" && selectedIds.size === 0) setLens({ kind: "filter", filter: "all" });
  }, [lens.kind, selectedIds.size]);

  // Bộ gõ tiếng Việt chốt chữ đang gõ dở khi bấm Tab → chữ vừa thành chip bị
  // chèn lại ngay sau đó; bỏ qua lần chèn này (giống Spotlight).
  const consumed = useRef<{ text: string; until: number } | null>(null);
  const pick = (next: Lens, rest = "") => {
    consumed.current = { text, until: performance.now() + 300 };
    setLens(next);
    setText(rest);
  };
  const changeText = (value: string) => {
    const c = consumed.current;
    if (c && performance.now() < c.until && value.trim() === c.text.trim()) {
      consumed.current = null;
      return;
    }
    setText(value);
  };
  const changeLens = (next: Lens) => {
    setLens(lensKey(next) === lensKey(lens) && next.kind !== "filter" ? { kind: "filter", filter: "all" } : next);
    if (next.kind === "selected") setText("");
  };

  // Callback ổn định cho ô ảnh (memo) — đọc giá trị mới nhất qua ref.
  const latest = useRef({ items, selectedIds, onToggle, onToggleMany });
  latest.current = { items, selectedIds, onToggle, onToggleMany };
  const anchor = useRef<number | null>(null);
  useEffect(() => {
    anchor.current = null;
  }, [lens, debounced]);

  const onPress = useCallback((index: number, shiftKey: boolean) => {
    const { items: list, selectedIds: selected, onToggle: toggle, onToggleMany: toggleMany } = latest.current;
    const item = list[index];
    if (!item) return;
    const from = anchor.current;
    if (shiftKey && toggleMany && from !== null && from !== index) {
      const [a, b] = from < index ? [from, index] : [index, from];
      toggleMany(list.slice(a, b + 1), !selected.has(item.id));
    } else {
      toggle(item);
    }
    anchor.current = index;
  }, []);

  const searching = Boolean(debounced.trim());
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <PickerSearchBar
        text={text}
        onTextChange={changeText}
        chip={chip}
        onPick={pick}
        onClearChip={() => setLens({ kind: "filter", filter: "all" })}
        suggestions={suggestions}
        scopes={scopes}
      />

      <PickerLensBar
        lens={lens}
        onLens={changeLens}
        selectedCount={selectedIds.size}
        canShowSelected={Boolean(selectedItems)}
        labels={scopes.filter((s) => s.kind === "label")}
        tags={tags}
        compact={searching}
        counter={
          showCount && max !== undefined && max > 1 ? (
            <span className={cn("shrink-0 text-xs tabular-nums", locked ? "text-primary" : "text-muted-foreground")}>
              {selectedIds.size}/{max}
            </span>
          ) : null
        }
      />

      <PickerGrid
        items={items}
        selectedIds={selectedIds}
        locked={locked}
        loading={!showingSelected && query.loading}
        hasMore={!showingSelected && query.hasMore}
        loadingMore={!showingSelected && query.loadingMore}
        onLoadMore={query.loadMore}
        onPress={onPress}
        error={!showingSelected && query.error}
        onRetry={query.retry}
        errorText={t("mediaPicker.loadFailed")}
        retryText={t("mediaPicker.retry")}
        emptyText={query.isSearch ? t("mediaPicker.noResults") : t("mediaPicker.empty")}
        className={gridClassName}
      />
      {query.isSearch && !showingSelected && (
        <p className="text-[11px] text-muted-foreground">
          {searching ? t("mediaPicker.searchHint") : t("mediaPicker.scopeHint")}
        </p>
      )}
    </div>
  );
};
