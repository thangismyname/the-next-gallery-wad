// 2 hàng chip dưới ô tìm: loại (tất cả / ảnh / video / yêu thích / đã chọn) +
// nhãn cá nhân & tag AI (kèm số ảnh) — bấm là lọc, không cần nhớ tên.
import { type MediaFilter, type PickAlbum } from "@tng/shared";
import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SearchScope } from "@/features/search/searchScope";
import { lensKey, type Lens, type TagOption } from "../lens";
import { LensIcon } from "./LensIcon";

const FILTERS: MediaFilter[] = ["all", "photos", "videos", "favorites"];

const Chip: React.FC<{
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
} & React.ComponentProps<"button">> = ({ active, onClick, children, ...rest }) => (
  <button
    type="button"
    {...rest}
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
  /** Album thường (của mình + được chia sẻ) + album tự động — menu "Album ▾". */
  albums: PickAlbum[];
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
  albums,
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
          {albums.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Chip active={lens.kind === "album" || (lens.kind === "scope" && lens.scope.kind === "album")}>
                  <FolderOpen className="size-3.5" />
                  <span className="max-w-32 truncate">
                    {lens.kind === "album"
                      ? lens.album.name
                      : lens.kind === "scope" && lens.scope.kind === "album"
                        ? lens.scope.name
                        : t("mediaPicker.filter.album")}
                  </span>
                  <ChevronDown className="size-3 opacity-60" />
                </Chip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                {albums.map((album, i) => {
                  const group = album.group ?? "regular";
                  const heading = i === 0 || (albums[i - 1].group ?? "regular") !== group;
                  return (
                    <React.Fragment key={album.key}>
                      {heading && (
                        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                          {group === "regular" ? t("albums.mine") : t(`albums.auto.groups.${group}`)}
                        </DropdownMenuLabel>
                      )}
                      <DropdownMenuItem
                        onSelect={() => onLens({ kind: "album", album })}
                        className={cn(activeKey === album.key && "font-medium")}
                      >
                        <FolderOpen className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate">{album.name}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{album.count}</span>
                      </DropdownMenuItem>
                    </React.Fragment>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
