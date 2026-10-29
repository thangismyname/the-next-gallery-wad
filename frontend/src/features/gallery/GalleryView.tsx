import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ImageCard } from "./components/ImageCard";
import { UploadButton } from "./components/UploadButton";
import { Lightbox } from "./components/Lightbox";
import { SelectionActionBar } from "./components/SelectionActionBar";
import { Media } from "../../types";
import { useGalleryMedia } from "@/hooks/useGalleryMedia";
import { useIntroStagger } from "@/hooks/useIntroStagger";
import { useGridSize } from "@/hooks/useGridSize";
import { useInfiniteSentinel } from "@/hooks/useInfiniteSentinel";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { columnsFor, gridMetrics } from "./gridLayout";
import { GALLERY_COLUMNS, useGridDensity } from "@/hooks/useGridDensity";
import { toMedia } from "@/services/media";
import type { GallerySort } from "@/services/media";
import { useSelectionStore } from "@/hooks/useSelectionStore";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDisplayRows, DisplayRow } from "@/utils/mediaGrouping";

const HEADER_HEIGHT = 44;
// Header của MainLayout (h-16) — tiêu đề nhóm dính ngay dưới.
const APP_HEADER_HEIGHT = 64;


export const GalleryView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<GallerySort>("newest");
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGalleryMedia(sort);

  const pages = useMemo(() => data?.pages ?? [], [data]);
  const mediaList = useMemo(
    () => pages.flatMap((p) => p.items.map(toMedia)),
    [pages],
  );
  // Tổng số thật từ API (không chỉ số đã tải); API cũ không trả → số đã tải.
  const totalCount = pages[0]?.total ?? mediaList.length;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelecting = useSelectionStore((s) => s.setSelecting);
  const { handleShare, handleDownload, handleDelete, handleFavorite } =
    useGalleryActions();
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);

  // Tải thêm khi cuộn gần đáy (hooks/useInfiniteSentinel).
  const sentinelRef = useInfiniteSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });
  const sortOptions = [
    { value: "newest", label: t("gallery.sort.newest") },
    { value: "oldest", label: t("gallery.sort.oldest") },
    { value: "name_asc", label: t("gallery.sort.nameAsc") },
    { value: "name_desc", label: t("gallery.sort.nameDesc") },
  ];

  const handleSortChange = useCallback((value: string) => {
    if (!value) return;
    setSort(value as GallerySort);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Kích thước lưới (hooks/useGridSize) ────────────────────────────────
  // Đo lại vị trí khi banner lỗi / trạng thái tải làm lưới dịch xuống.
  const {
    ref: gridWrapRef,
    width: gridWidth,
    scrollMargin,
  } = useGridSize(`${isError}-${isPending}`);
  const density = useGridDensity((s) => s.density);
  const columns = columnsFor(gridWidth, GALLERY_COLUMNS[density]);
  const { gap: gridGap, cell: cellSize, rowHeight: gridRowHeight } = gridMetrics(
    gridWidth,
    columns,
  );


  // Nhãn nhóm thời gian/chữ cái
  const groupLabels = useMemo(
    () => ({
      today: t("gallery.group.today"),
      yesterday: t("gallery.group.yesterday"),
      thisWeek: t("gallery.group.thisWeek"),
      thisMonth: t("gallery.group.thisMonth"),
      undated: t("gallery.group.undated"),
    }),
    [t],
  );

  // Danh sách hàng hiển thị: header (nhóm thời gian/chữ cái) + grid ảnh
  const rows = useMemo(
    () =>
      buildDisplayRows(mediaList, columns, sort, groupLabels, i18n.language),
    [mediaList, columns, sort, groupLabels, i18n.language],
  );
  const rowsRef = useRef<DisplayRow[]>(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Nhãn nhóm của từng hàng (để hiện nhóm đang xem ở thanh dính trên cùng).
  const groupOfRow = useMemo(() => {
    let current = "";
    return rows.map((row) => {
      if (row.type === "header") current = row.label;
      return current;
    });
  }, [rows]);

  // Virtualizer theo hàng HỖN HỢP (header row + grid row).
  // Scroll container là window (trang cuộn toàn màn hình như Google Photos).
  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) =>
      rowsRef.current[index]?.type === "header" ? HEADER_HEIGHT : gridRowHeight,
    overscan: 4,
    scrollMargin,
    getItemKey: (index) => rowsRef.current[index]?.key ?? index,
  });

  // Ô to / nhỏ đi (đổi cỡ cửa sổ, đổi số cột) → đo lại mọi hàng.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [gridRowHeight, columns, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Lần đầu có dữ liệu: các hàng đầu hiện nối nhau (chỉ ~0.8s đầu).
  const introStyle = useIntroStagger(!isPending);
  // Nhóm đang ở đầu màn hình: hàng đầu tiên còn thấy dưới header của app.
  const viewTop = (rowVirtualizer.scrollOffset ?? 0) + APP_HEADER_HEIGHT;
  const firstVisible = virtualItems.find((v) => v.end > viewTop);
  const stickyLabel =
    firstVisible && viewTop > scrollMargin + HEADER_HEIGHT
      ? groupOfRow[firstVisible.index]
      : null;


  const handleUploaded = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openPreview = useCallback(
    (media: Media) => {
      const idx = mediaList.findIndex((m) => m.id === media.id);
      if (idx !== -1) setSelectedIndex(idx);
    },
    [mediaList],
  );

  const closePreview = useCallback(() => setSelectedIndex(null), []);

  // Khi xóa ảnh đang mở trong lightbox → cache gallery thu hẹp. Clamp về ảnh cuối
  // còn lại (hoặc đóng lightbox nếu hết ảnh) để index không trỏ ra ngoài mảng.
  useEffect(() => {
    if (selectedIndex === null) return;
    if (mediaList.length === 0) {
      setSelectedIndex(null);
      return;
    }
    if (selectedIndex >= mediaList.length) {
      setSelectedIndex(mediaList.length - 1);
    }
  }, [selectedIndex, mediaList.length]);

  // ── Chọn ảnh: Shift + click chọn dải, chọn cả nhóm, Esc thoát ─────────
  const orderedIds = useMemo(() => mediaList.map((m) => m.id), [mediaList]);
  const { toggleItem, toggleGroup } = useRangeSelection(orderedIds, sort);
  const handleToggle = useCallback(
    (media: Media) => {
      toggleItem(media.id);
      setSelectedIndex(null);
    },
    [toggleItem],
  );

  const goPrev = useCallback(
    () =>
      setSelectedIndex((i) =>
        i === null ? null : (i - 1 + mediaList.length) % mediaList.length,
      ),
    [mediaList.length],
  );

  const goNext = useCallback(
    () =>
      setSelectedIndex((i) => (i === null ? null : (i + 1) % mediaList.length)),
    [mediaList.length],
  );

  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: gridGap,
  };
  // Bề rộng ô thật (đã trừ sidebar, padding) → trình duyệt chọn đúng bản 200/400px.
  const cellSizes = `${Math.ceil(cellSize)}px`;

  return (
    <div className="space-y-4">
      {/* Header — mobile: tiêu đề 1 hàng, nút 1 hàng lấp đầy (ô sắp xếp giãn);
          từ sm: tiêu đề trái, nút phải. Mọi nút cùng cao h-9. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("gallery.allPhotos.title")}
          </h2>
          {!isPending && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("gallery.allPhotos.itemCount", { count: totalCount })}
            </span>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Combobox
            value={sort}
            onChange={handleSortChange}
            options={sortOptions}
            placeholder={t("gallery.sort.label")}
            searchPlaceholder={t("gallery.sort.label")}
            className="h-9 min-w-0 flex-1 px-3 sm:w-36 sm:flex-none"
          />
          <Button
            variant={isSelecting ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelecting(!isSelecting)}
          >
            {isSelecting
              ? t("gallery.selection.cancel")
              : t("gallery.selection.select")}
          </Button>
          <UploadButton onUploaded={handleUploaded} />
        </div>
      </div>

      {/* Thông báo lỗi */}
      {isError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-center text-sm">
          {t("gallery.error.loadFailed")}
        </div>
      )}

      <div ref={gridWrapRef}>
        {/* Nhóm đang xem — dính ngay dưới header của app khi cuộn qua tiêu đề nhóm */}
        {/* Luôn render (cao 0) → hiện / ẩn nhãn không làm lưới nhảy. */}
        <div
          className="pointer-events-none sticky z-30 h-0"
          style={{ top: APP_HEADER_HEIGHT }}
          aria-hidden={!stickyLabel}
        >
          {stickyLabel && (
            <span className="absolute top-2 left-0 inline-flex items-center rounded-full border border-border/60 bg-background/90 px-3 py-1 text-sm font-semibold text-foreground shadow-sm backdrop-blur">
              {stickyLabel}
            </span>
          )}
        </div>
        {isPending ? (
          // Khung chờ cùng số cột + khoảng cách với lưới thật → không nhảy bố cục.
          <div className="grid" style={gridStyle}>
            {Array.from({ length: columns * 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-square rounded-lg bg-muted/40"
              />
            ))}
          </div>
        ) : mediaList.length === 0 && !isError ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <ImagePlus className="size-10 animate-float text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("gallery.empty")}
              </p>
              <p className="mt-1 text-xs">{t("gallery.emptyHint")}</p>
            </div>
            <UploadButton onUploaded={handleUploaded} />
          </div>
        ) : mediaList.length === 0 ? null : (
          /* Gallery Grid (virtualized theo hàng) */
          <div
            className="relative w-full"
            style={{
              height: `${Math.max(rowVirtualizer.getTotalSize(), 1)}px`,
            }}
          >
            <div
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${(virtualItems[0]?.start ?? scrollMargin) - scrollMargin}px)`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                if (row.type === "header") {
                  const allSelected =
                    isSelecting && row.ids.every((id) => selectedIds.has(id));
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      className="group/header flex items-end gap-2 px-1 pb-2"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-sm font-semibold text-foreground/80">
                        {row.label}
                      </span>
                      {/* Chọn cả nhóm — hiện khi rê chuột hoặc đang chọn */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(row.ids)}
                        aria-pressed={allSelected}
                        aria-label={t("gallery.selection.selectGroup", {
                          group: row.label,
                        })}
                        title={t("gallery.selection.selectGroup", {
                          group: row.label,
                        })}
                        className={cn(
                          "mb-0.5 flex size-5 items-center justify-center rounded-full border transition-opacity",
                          "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
                          allSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/50 text-transparent hover:text-muted-foreground",
                          isSelecting
                            ? "opacity-100"
                            : "opacity-0 group-hover/header:opacity-100",
                        )}
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  );
                }

                const appear = introStyle(virtualRow.index);
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    className={cn("grid", appear.className)}
                    style={{ ...gridStyle, paddingBottom: gridGap, ...appear.style }}
                  >
                    {row.items.map((media) => (
                      <ImageCard
                        key={media.id}
                        media={media}
                        sizes={cellSizes}
                        onClick={openPreview}
                        selected={selectedIds.has(media.id)}
                        onToggle={isSelecting ? handleToggle : undefined}
                        onLongPress={handleToggle}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sentinel trigger tải tiếp khi cuộn (dùng khi cuộn window chính) */}
      {!isPending && mediaList.length > 0 && (
        <div ref={sentinelRef} className="h-4 w-full" />
      )}

      {/* Indicator khi đang tải thêm ngầm */}
      {isFetchingNextPage && (
        <div className="flex justify-center items-center py-6 gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>{t("gallery.loadingMore")}</span>
        </div>
      )}

      {/* Lightbox xem ảnh lớn */}
      {selectedIndex !== null && mediaList[selectedIndex] && !isSelecting && (
        <Lightbox
          media={mediaList[selectedIndex]}
          mediaList={mediaList}
          onClose={closePreview}
          onPrev={mediaList.length > 1 ? goPrev : undefined}
          onNext={mediaList.length > 1 ? goNext : undefined}
          onSelect={setSelectedIndex}
          onToggleFavorite={() => handleFavorite([mediaList[selectedIndex].id])}
          onDelete={() => handleDelete([mediaList[selectedIndex].id])}
          onAddToAlbum={() => openAddToAlbum([mediaList[selectedIndex].id])}
        />
      )}

      {/* Toolbar chọn ảnh — desktop (mobile dùng BottomBar sẵn có) */}
      {isSelecting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden sm:block">
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
