import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Heart, Loader2, Settings2, Bookmark, ChevronDown } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toMedia } from "@/services/media";
import { fetchSaved, savedQueryKey, type SavedFilter } from "@/services/labels";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { useSelectionStore } from "@/hooks/useSelectionStore";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { AnimatedGridItem } from "@/components/motion/AnimatedGridItem";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { SelectionActionBar } from "@/features/gallery/components/SelectionActionBar";
import { GRID_DENSITY_CLASS, useGridDensity } from "@/hooks/useGridDensity";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "./labelColors";
import { useLabels } from "./useLabels";
import { useLabelManager } from "./useLabelManager";
import { LabelDots } from "./components/LabelDots";
import { LabelFilterSheet } from "./components/LabelFilterSheet";

/** Chip lọc: Tất cả · Đã thả tim · từng nhãn. */
const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  className?: string;
}> = ({ active, onClick, count, children, className }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors active:scale-95",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
      className,
    )}
  >
    {children}
    <span className={cn("tabular-nums", active ? "opacity-70" : "opacity-60")}>{count}</span>
  </button>
);

/**
 * /favorites — ảnh có tim HOẶC có nhãn cá nhân ("Cần chỉnh sửa", "In ảnh"…).
 * Lọc theo chip (?filter=favorites|<labelId>), nhấn giữ / chuột phải để chọn
 * nhiều rồi gắn nhãn, bỏ tim, thêm album, chia sẻ.
 */
export const FavoritesView: React.FC = () => {
  const { t } = useTranslation();
  const density = useGridDensity((s) => s.density);
  const [params, setParams] = useSearchParams();
  const { labels, totals, isPending: labelsPending } = useLabels();
  const openManager = useLabelManager((s) => s.setOpen);

  // Nhãn đã bị xoá → về "Tất cả" (chờ danh sách nhãn tải xong mới kiểm tra).
  const requested = params.get("filter") ?? "all";
  const filter: SavedFilter =
    labelsPending || requested === "favorites" || labels.some((l) => l.id === requested)
      ? requested
      : "all";
  const setFilter = (next: SavedFilter) => {
    setParams(next === "all" ? {} : { filter: next }, { replace: true });
    setSelectedIndex(null);
  };
  const activeLabel = labels.find((l) => l.id === filter);
  // Mobile: chỉ hiện nhãn đang chọn, các nhãn khác nằm trong sheet "Nhãn ▾".
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: savedQueryKey(filter),
    queryFn: () => fetchSaved(filter),
    staleTime: 30_000,
  });
  const saved = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => saved.map(toMedia), [saved]);
  const orderedIds = useMemo(() => items.map((m) => m.id), [items]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const currentMedia = selectedIndex !== null ? items[selectedIndex] : null;

  // Chọn nhiều — dùng store chung nên BottomBar (mobile) cũng hiện thanh thao tác.
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelecting = useSelectionStore((s) => s.setSelecting);
  const clearSelection = useSelectionStore((s) => s.clear);
  const { toggleItem } = useRangeSelection(orderedIds, filter);
  useEffect(() => clearSelection, [clearSelection]);

  const { handleShare, handleDownload, handleDelete, handleFavorite } = useGalleryActions();
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);

  const emptyText =
    filter === "all"
      ? t("favorites.empty")
      : filter === "favorites"
        ? t("favorites.emptyHearts")
        : t("favorites.emptyLabel", { name: activeLabel?.name ?? "" });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
          <Heart className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("favorites.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("favorites.subtitle", { count: String(totals.all) })}
          </p>
        </div>
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {items.length > 0 && (
          <Button
            variant={isSelecting ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelecting(!isSelecting)}
          >
            {isSelecting ? t("gallery.selection.cancel") : t("gallery.selection.select")}
          </Button>
        )}
      </div>

      {/* Lọc: tất cả · thả tim · nhãn — xuống dòng, không cuộn ngang */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={totals.all}>
          {t("favorites.filters.all")}
        </FilterChip>
        <FilterChip
          active={filter === "favorites"}
          onClick={() => setFilter("favorites")}
          count={totals.favorites}
        >
          <Heart className={cn("size-3.5", filter !== "favorites" && "text-rose-500")} />
          {t("favorites.filters.favorites")}
        </FilterChip>
        {labels.map((label) => (
          <FilterChip
            key={label.id}
            active={filter === label.id}
            onClick={() => setFilter(label.id)}
            count={label.count}
            className={filter === label.id ? undefined : "hidden sm:inline-flex"}
          >
            <span className={cn("size-2 shrink-0 rounded-full", LABEL_DOT[label.color])} />
            <span className="max-w-40 truncate">{label.name}</span>
          </FilterChip>
        ))}
        <button
          type="button"
          onClick={() => setLabelSheetOpen(true)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground active:scale-95 sm:hidden"
        >
          <Bookmark className="size-3.5" />
          {t("favorites.labels.title")}
          <ChevronDown className="size-3.5" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openManager(true)}
          className="hidden h-8 rounded-full text-xs text-muted-foreground sm:inline-flex"
        >
          <Settings2 className="size-3.5" />
          {t("favorites.labels.manage")}
        </Button>
      </div>

      {/* Content */}
      {isPending ? (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p className="text-sm">{t("gallery.error.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t("trash.retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          {activeLabel ? (
            <Bookmark className="size-10 animate-float text-muted-foreground/40" />
          ) : (
            <Heart className="size-10 animate-float text-muted-foreground/40" />
          )}
          <p className="max-w-xs whitespace-pre-line text-sm">{emptyText}</p>
        </div>
      ) : (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((media, i) => (
              <AnimatedGridItem key={media.id}>
                <ImageCard
                  media={media}
                  onClick={(m) => setSelectedIndex(items.findIndex((x) => x.id === m.id))}
                  selected={selectedIds.has(media.id)}
                  onToggle={isSelecting ? (m) => toggleItem(m.id) : undefined}
                  onLongPress={(m) => toggleItem(m.id)}
                  badge={
                    <LabelDots
                      labelIds={saved[i]?.labelIds ?? []}
                      labels={labels}
                      favorite={Boolean(media.isFavorite)}
                    />
                  }
                />
              </AnimatedGridItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      <LabelFilterSheet
        open={labelSheetOpen}
        onOpenChange={setLabelSheetOpen}
        labels={labels}
        activeId={activeLabel?.id ?? null}
        onPick={setFilter}
      />

      {/* Lightbox xem ảnh lớn */}
      {currentMedia && !isSelecting && (
        <Lightbox
          media={currentMedia}
          mediaList={items}
          onClose={() => setSelectedIndex(null)}
          onPrev={selectedIndex! > 0 ? () => setSelectedIndex(selectedIndex! - 1) : undefined}
          onNext={selectedIndex! < items.length - 1 ? () => setSelectedIndex(selectedIndex! + 1) : undefined}
          onSelect={setSelectedIndex}
          onToggleFavorite={() => void handleFavorite([currentMedia.id], !currentMedia.isFavorite)}
          onDelete={() => {
            setSelectedIndex(null);
            handleDelete([currentMedia.id]);
          }}
          onAddToAlbum={() => openAddToAlbum([currentMedia.id])}
        />
      )}

      {/* Toolbar chọn ảnh — desktop (mobile dùng BottomBar) */}
      {isSelecting && (
        <div className="fixed bottom-6 left-1/2 z-50 hidden -translate-x-1/2 sm:block">
          <SelectionActionBar
            onShare={handleShare}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onFavorite={handleFavorite}
          />
        </div>
      )}
    </div>
  );
};
