// Lưới chọn ảnh/video đã có trên tài khoản — bộ lọc (tất cả/yêu thích/ảnh/video)
// + phân trang "tải thêm". Dùng chung cho share (FriendsTab, SendView).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchMediaByFilter,
  MediaFilter,
  MediaListItem,
} from "@/services/media";

const PAGE_SIZE = 60;

interface MediaPickerProps {
  selectedIds: ReadonlySet<string>;
  onToggle: (item: MediaListItem) => void;
  /** Class cho vùng cuộn của lưới (chiều cao, số cột). */
  gridClassName?: string;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({
  selectedIds,
  onToggle,
  gridClassName,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const filterOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "all", label: t("mediaPicker.filterAll") },
      { value: "favorites", label: t("mediaPicker.filterFavorites") },
      { value: "photos", label: t("mediaPicker.filterPhotos") },
      { value: "videos", label: t("mediaPicker.filterVideos") },
    ],
    [t],
  );

  // Trang đầu — khi mount hoặc đổi bộ lọc.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setHasMore(false);
    fetchMediaByFilter(filter, 0, PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchMediaByFilter(filter, items.length, PAGE_SIZE);
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.items.filter((m) => !seen.has(m.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [filter, hasMore, items.length, loadingMore]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Combobox
          value={filter}
          onChange={(value) => {
            if (value && value !== filter) setFilter(value as MediaFilter);
          }}
          options={filterOptions}
          placeholder={t("mediaPicker.filterAll")}
          searchPlaceholder={t("mediaPicker.filterSearch")}
          emptyText={t("mediaPicker.filterEmpty")}
          className="h-7 w-[140px]"
        />
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("mediaPicker.selectedCount", { count: selectedIds.size })}
          </span>
        )}
      </div>

      <div
        className={cn(
          "grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5",
          gridClassName,
        )}
      >
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-md bg-muted/40"
            />
          ))
        ) : items.length === 0 ? (
          <span className="col-span-full py-6 text-center text-xs text-muted-foreground">
            {t("mediaPicker.empty")}
          </span>
        ) : (
          items.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-md ring-1 transition [content-visibility:auto]",
                  selected
                    ? "ring-2 ring-primary"
                    : "ring-border/50 hover:ring-primary/50",
                )}
                title={item.title ?? ""}
                aria-pressed={selected}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.title ?? ""}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                {item.mediaType === "video" && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] text-white">
                    {t("mediaPicker.video")}
                  </span>
                )}
                {selected && (
                  <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              t("mediaPicker.loadMore")
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
