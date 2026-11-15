// 2 hàng chip dưới ô tìm: loại (tất cả / ảnh / video / yêu thích / đã chọn) +
// nhãn cá nhân & tag AI (kèm số ảnh) — bấm là lọc, không cần nhớ tên.
import { type MediaFilter } from "@tng/shared";
import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SearchScope } from "@/features/search/searchScope";
import { lensKey, type Lens, type TagOption } from "../lens";
import { LensIcon } from "./LensIcon";

const FILTERS: MediaFilter[] = ["all", "photos", "videos", "favorites"];

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border/60 text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

interface PickerLensBarProps {
  lens: Lens;
  onLens: (lens: Lens) => void;
  selectedCount: number;
  /** Có danh sách ảnh đã chọn để xem lại không. */
  canShowSelected: boolean;
  labels: SearchScope[];
  tags: TagOption[];
  /** Ẩn hàng nhãn / tag (vd đang gõ tìm). */
  compact: boolean;
  counter?: React.ReactNode;
}

export const PickerLensBar: React.FC<PickerLensBarProps> = ({
  lens,
  onLens,
  selectedCount,
  canShowSelected,
  labels,
  tags,
  compact,
  counter,
}) => {
  const { t } = useTranslation();
  const activeKey = lensKey(lens);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <Chip key={f} active={activeKey === `filter:${f}`} onClick={() => onLens({ kind: "filter", filter: f })}>
              {t(`mediaPicker.filter.${f}`)}
            </Chip>
          ))}
          {canShowSelected && selectedCount > 0 && (
            <Chip active={activeKey === "selected"} onClick={() => onLens({ kind: "selected" })}>
              {t("mediaPicker.filter.selected", { count: selectedCount })}
            </Chip>
          )}
        </div>
        {counter}
      </div>
      {!compact && (labels.length > 0 || tags.length > 0) && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          {labels.map((scope) => {
            const l: Lens = { kind: "scope", scope };
            return (
              <Chip key={scope.key} active={activeKey === scope.key} onClick={() => onLens(l)}>
                <LensIcon lens={l} />
                {scope.name}
              </Chip>
            );
          })}
          {labels.length > 0 && tags.length > 0 && <span className="mx-0.5 w-px shrink-0 self-stretch bg-border" />}
          {tags.map((tag) => {
            const l: Lens = { kind: "tag", tag: tag.tag, name: tag.name };
            return (
              <Chip key={tag.tag} active={activeKey === `tag:${tag.tag}`} onClick={() => onLens(l)}>
                <LensIcon lens={l} className="size-3" />
                {tag.name}
                <span className="tabular-nums opacity-60">{tag.count}</span>
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
};
