// Lưới ảo hoá theo hàng (cuộn trong khung riêng, không phải cửa sổ): chỉ các
// hàng đang thấy (+ vài hàng đệm) nằm trong DOM → mượt với hàng nghìn ảnh.
// Cuộn gần cuối tự tải trang tiếp. Số cột theo bề rộng khung.
import { type MediaListItem } from "@tng/shared";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PickerTile } from "./PickerTile";

const GAP = 6;
/** Ô mong muốn ~ 104 px → 3 cột trên điện thoại, 5–7 trên dialog rộng. */
const TARGET_TILE = 104;
const MIN_COLS = 3;
const MAX_COLS = 8;
/** Còn ≤ 3 hàng là tới cuối → tải tiếp. */
const PRELOAD_ROWS = 3;

interface PickerGridProps {
  items: MediaListItem[];
  selectedIds: ReadonlySet<string>;
  locked: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onPress: (index: number, shiftKey: boolean) => void;
  emptyText: string;
  /** Tải lỗi → thông báo + nút thử lại (thay vì lưới trống). */
  error?: boolean;
  onRetry?: () => void;
  errorText?: string;
  retryText?: string;
  className?: string;
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export const PickerGrid: React.FC<PickerGridProps> = ({
  items,
  selectedIds,
  locked,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onPress,
  emptyText,
  error,
  onRetry,
  errorText,
  retryText,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const width = useWidth(scrollRef);
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.floor((width + GAP) / (TARGET_TILE + GAP)) || MIN_COLS));
  const size = width ? Math.floor((width - GAP * (cols - 1)) / cols) : TARGET_TILE;
  const rowCount = Math.ceil(items.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => size + GAP,
    overscan: 4,
  });

  // Đổi số cột / cỡ ô → đo lại chiều cao hàng.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [size, cols, virtualizer]);

  const rows = virtualizer.getVirtualItems();
  const lastRow = rows[rows.length - 1]?.index ?? -1;
  const nearEnd = lastRow >= rowCount - PRELOAD_ROWS;
  React.useEffect(() => {
    if (nearEnd && hasMore && !loadingMore && !loading) onLoadMore();
  }, [nearEnd, hasMore, loadingMore, loading, onLoadMore, items.length]);

  return (
    <div
      ref={scrollRef}
      className={cn("relative h-72 overflow-y-auto overscroll-contain pr-1", className)}
    >
      {loading ? (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols * 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          {errorText}
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-xs font-medium text-foreground underline-offset-2 hover:underline">
              {retryText}
            </button>
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((row) => {
            const start = row.index * cols;
            return (
              <div
                key={row.key}
                className="absolute inset-x-0 top-0 flex"
                style={{ transform: `translateY(${row.start}px)`, gap: GAP, height: size }}
              >
                {items.slice(start, start + cols).map((item, i) => (
                  <PickerTile
                    key={item.id}
                    item={item}
                    index={start + i}
                    selected={selectedIds.has(item.id)}
                    locked={locked}
                    size={size}
                    onPress={onPress}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {loadingMore && (
        <div className="flex justify-center py-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
};
