import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive,
  Loader2,
  RotateCcw,
  Trash2,
  X,
  Check,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchTrash,
  trashQueryKey,
  restoreMedia,
  permanentDeleteMedia,
  toMedia,
} from "@/services/media";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import { AnimatePresence } from "framer-motion";
import { AnimatedGridItem } from "@/components/motion/AnimatedGridItem";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { TrashCardActions } from "./components/TrashCardActions";
import { GRID_DENSITY_CLASS, useGridDensity } from "@/hooks/useGridDensity";
import { cn } from "@/lib/utils";

export const TrashView: React.FC = () => {
  const { t } = useTranslation();
  const density = useGridDensity((s) => s.density);
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: trashQueryKey,
    queryFn: () => fetchTrash(0, 1000),
    staleTime: 30_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  // Lightbox: mở ảnh + panel chi tiết
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const currentMedia =
    selectedIndex !== null ? toMedia(items[selectedIndex]) : null;

  // Selection local cho riêng trang Thùng rác (không dùng chung store của gallery)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggle = useCallback((media: { id: string }) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(media.id)) next.delete(media.id);
      else next.add(media.id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectAll = useCallback(
    (ids: string[]) => setSelectedIds(new Set(ids)),
    [],
  );

  const [confirmTarget, setConfirmTarget] = useState<
    "single" | "batch" | "all" | null
  >(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allSelected =
    items.length > 0 && selectedIds.size === items.length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trashQueryKey });
    queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
  };

  const doRestore = async (ids: string[]) => {
    setBusy(true);
    try {
      await restoreMedia(ids);
      clearSelection();
      invalidate();
    } catch (err) {
      console.error("Khôi phục thất bại:", err);
    } finally {
      setBusy(false);
    }
  };

  const doDeleteForever = async (ids: string[]) => {
    setBusy(true);
    try {
      await permanentDeleteMedia(ids);
      clearSelection();
      invalidate();
    } catch (err) {
      console.error("Xóa vĩnh viễn thất bại:", err);
    } finally {
      setBusy(false);
    }
  };

  const confirmDialog = (target: "single" | "batch" | "all", id?: string) => {
    setPendingId(id ?? null);
    setConfirmTarget(target);
  };

  const confirmDelete = () => {
    if (confirmTarget === "all") {
      void doDeleteForever(items.map((m) => m.id));
    } else if (confirmTarget === "batch") {
      void doDeleteForever(Array.from(selectedIds));
    } else if (confirmTarget === "single" && pendingId) {
      void doDeleteForever([pendingId]);
    }
    setConfirmTarget(null);
  };

  const restoreAll = () => {
    if (items.length === 0) return;
    void doRestore(items.map((m) => m.id));
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <HardDrive className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {t("trash.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("trash.subtitle", { count: String(items.length) })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {items.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={restoreAll}
              >
                <RotateCcw className="size-3.5" />
                {t("trash.restoreAll")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => confirmDialog("all")}
              >
                <Trash2 className="size-3.5" />
                {t("trash.emptyTrash")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Batch selection bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2 glass">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSelection}
            aria-label={t("selection.cancel")}
          >
            <X className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("selection.count", { count: selectedIds.size })}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void doRestore(Array.from(selectedIds));
              }}
            >
              <RotateCcw className="size-3.5" />
              {t("trash.restore")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => confirmDialog("batch")}
            >
              <Trash2 className="size-3.5" />
              {t("trash.deleteForever")}
            </Button>
          </div>
        </div>
      )}

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
          <HardDrive className="size-10 animate-float text-muted-foreground/40" />
          <p className="text-sm">{t("trash.empty")}</p>
        </div>
      ) : (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {/* Khôi phục / xoá vĩnh viễn → ô thu nhỏ biến mất, ô khác trượt lấp chỗ */}
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((media, index) => (
              <AnimatedGridItem key={media.id}>
                <ImageCard
                  media={media}
                  selected={selectedIds.has(media.id)}
                  onClick={() => setSelectedIndex(index)}
                  onToggle={selectedIds.size > 0 ? toggle : undefined}
                  onLongPress={toggle}
                  actions={
                    <TrashCardActions
                      onRestore={() => void doRestore([media.id])}
                      onDeleteForever={() => confirmDialog("single", media.id)}
                    />
                  }
                />
              </AnimatedGridItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Select all toggle */}
      {items.length > 0 && (
        <button
          onClick={() =>
            allSelected ? clearSelection() : selectAll(items.map((m) => m.id))
          }
          className="mt-4 mx-auto flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition"
        >
          {allSelected ? <Check className="size-3.5" /> : null}
          {allSelected ? t("trash.deselectAll") : t("trash.selectAll")}
        </button>
      )}

      {/* Confirm dialog: xóa vĩnh viễn */}
      <Dialog open={confirmTarget !== null} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("trash.deleteForeverTitle")}</DialogTitle>
            <DialogDescription>
              {confirmTarget === "all"
                ? t("trash.deleteForeverAllDesc")
                : confirmTarget === "batch"
                  ? t("trash.deleteForeverBatchDesc", {
                    count: String(selectedIds.size),
                  })
                  : t("trash.deleteForeverDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={busy}
            >
              {t("share.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={confirmDelete}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("trash.deleteForever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox: xem ảnh lớn + panel chi tiết */}
      {currentMedia && (
        <Lightbox
          canDownload={false}
          media={currentMedia}
          mediaList={items.map(toMedia)}
          onClose={() => setSelectedIndex(null)}
          onPrev={
            selectedIndex! > 0
              ? () => setSelectedIndex(selectedIndex! - 1)
              : undefined
          }
          onNext={
            selectedIndex! < items.length - 1
              ? () => setSelectedIndex(selectedIndex! + 1)
              : undefined
          }
          onSelect={setSelectedIndex}
        />
      )}
    </div>
  );
};