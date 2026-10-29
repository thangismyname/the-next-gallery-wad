import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownUp,
  Check,
  ImageMinus,
  Images,
  Loader2,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence } from "framer-motion";
import { AnimatedGridItem } from "@/components/motion/AnimatedGridItem";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { GRID_DENSITY_CLASS, useGridDensity } from "@/hooks/useGridDensity";
import { cn } from "@/lib/utils";
import { authClient } from "@/services/authClient";
import {
  addAlbumMedia,
  convertAlbum,
  deleteAlbum,
  removeAlbumMedia,
  removeAlbumMember,
  respondAlbumInvitation,
  updateAlbum,
} from "@/services/albums";
import { useAlbumDetail } from "./useAlbumDetail";
import { type AlbumAction, AlbumHeader } from "./components/AlbumHeader";
import { AlbumFormDialog } from "./components/AlbumFormDialog";
import { AddMediaDialog } from "./components/AddMediaDialog";
import { ShareAlbumDialog } from "./components/ShareAlbumDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AlbumReorderGrid } from "./components/AlbumReorderGrid";

type Confirm = "delete" | "leave" | "convert" | "remove" | null;

/** Trang 1 album: ảnh (thường / thông minh / chung), chọn ảnh để gỡ / đặt bìa. */
export const AlbumDetailView: React.FC = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const density = useGridDensity((s) => s.density);
  const me = authClient.useSession().data?.user.id;
  const { handleFavorite, handleDelete } = useGalleryActions();
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);

  const [dialog, setDialog] = useState<"add" | "share" | "edit" | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [selecting, setSelecting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Chuyển sang album khác (vd bấm album trong Lightbox → Chi tiết): đóng
  // Lightbox + bỏ chọn / sắp xếp của album cũ.
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setSelectedIndex(null);
    setSelecting(false);
    setSelected(new Set());
    setReordering(false);
  }

  // Album + ảnh + run/refresh (useAlbumDetail.ts).
  const { albumQuery, album, mediaQuery, raw, items, refresh, run, busy } =
    useAlbumDetail(id);

  const isOwner = album?.role === "owner";
  const editable =
    album?.kind === "manual" && (isOwner || album?.role === "editor");
  const canRemove = (index: number) => isOwner || raw[index]?.addedBy === me;
  const selectedIndexes = items.flatMap((m, i) =>
    selected.has(m.id) ? [i] : [],
  );
  const allRemovable =
    selectedIndexes.length > 0 && selectedIndexes.every(canRemove);

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggle = (mediaId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });

  const onAction = (action: AlbumAction) => {
    if (action === "add" || action === "share" || action === "edit")
      setDialog(action);
    else setConfirm(action);
  };

  const confirmAction = () => {
    if (!album) return;
    if (confirm === "delete") {
      void run(
        () => deleteAlbum(album.id),
        () => navigate("/albums"),
      );
    } else if (confirm === "leave" && me) {
      void run(
        () => removeAlbumMember(album.id, me),
        () => navigate("/albums"),
      );
    } else if (confirm === "convert") {
      void run(
        () => convertAlbum(album.id),
        () => setConfirm(null),
      );
    } else if (confirm === "remove") {
      void run(
        () => removeAlbumMedia(album.id, [...selected]),
        () => {
          setConfirm(null);
          stopSelecting();
        },
      );
    }
  };

  if (albumQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Skeleton className="mb-6 h-36 rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-sm text-muted-foreground">
        <Images className="size-10 animate-float text-muted-foreground/40" />
        {t("albums.notFound")}
        <Button variant="outline" onClick={() => navigate("/albums")}>
          {t("albums.title")}
        </Button>
      </div>
    );
  }

  // Lời mời chưa nhận: chỉ hiện nút nhận / từ chối.
  if (album.pending) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <p className="text-sm text-muted-foreground">
          {t("albums.inviteToastBody", {
            name: album.owner.name ?? "",
            album: album.name,
          })}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void run(() => respondAlbumInvitation(album.id, true))
            }
          >
            <Check className="size-4" />
            {t("albums.accept")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => respondAlbumInvitation(album.id, false),
                () => navigate("/albums"),
              )
            }
          >
            {t("albums.decline")}
          </Button>
        </div>
      </div>
    );
  }

  const current = selectedIndex !== null ? items[selectedIndex] : null;
  const currentIsMine = current && raw[selectedIndex!]?.ownerId === me;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6">
      <AlbumHeader album={album} onAction={onAction} />

      {items.length > 0 && editable && !reordering && (
        <div className="mb-3 flex justify-end gap-2">
          {isOwner && items.length > 1 && !selecting && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReordering(true)}
            >
              <ArrowDownUp className="size-4" />
              {t("albums.reorder.button")}
            </Button>
          )}
          <Button
            variant={selecting ? "secondary" : "outline"}
            size="sm"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            {selecting
              ? t("gallery.selection.cancel")
              : t("gallery.selection.select")}
          </Button>
        </div>
      )}

      {reordering ? (
        <AlbumReorderGrid
          albumId={album.id}
          onDone={(saved) => {
            setReordering(false);
            if (saved) void refresh();
          }}
        />
      ) : mediaQuery.isPending ? (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-lg bg-muted/40"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
          <Images className="size-10 animate-float text-muted-foreground/40" />
          {album.kind === "smart"
            ? t("albums.smart.empty")
            : t("albums.emptyAlbum")}
          {editable && (
            <Button variant="outline" onClick={() => setDialog("add")}>
              {t("albums.addPhotos")}
            </Button>
          )}
        </div>
      ) : (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {/* Gỡ ảnh khỏi album → ô thu nhỏ biến mất, ô khác trượt lấp chỗ */}
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((media, i) => (
              <AnimatedGridItem key={media.id}>
                <ImageCard
                  media={media}
                  selected={selected.has(media.id)}
                  onToggle={selecting ? () => toggle(media.id) : undefined}
                  onLongPress={
                    editable
                      ? () => {
                          setSelecting(true);
                          toggle(media.id);
                        }
                      : undefined
                  }
                  onClick={() => setSelectedIndex(i)}
                />
              </AnimatedGridItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      {mediaQuery.hasNextPage && !reordering && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={mediaQuery.isFetchingNextPage}
            onClick={() => void mediaQuery.fetchNextPage()}
          >
            {mediaQuery.isFetchingNextPage && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t("mediaPicker.loadMore")}
          </Button>
        </div>
      )}

      {/* Thanh thao tác khi đang chọn ảnh */}
      {selecting && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5 pl-3 glass">
          <button
            onClick={stopSelecting}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted/50"
            aria-label={t("selection.cancel")}
          >
            <X className="size-4" />
          </button>
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {t("selection.count", { count: selected.size })}
          </span>
          {isOwner && selected.size === 1 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    updateAlbum(album.id, { coverMediaId: [...selected][0] }),
                  stopSelecting,
                )
              }
            >
              <Star className="size-4" />
              {t("albums.setCover")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy || !allRemovable}
            title={allRemovable ? undefined : t("albums.removeOnlyOwn")}
            onClick={() => setConfirm("remove")}
          >
            <ImageMinus className="size-4" />
            {t("albums.removeFromAlbum")}
          </Button>
        </div>
      )}

      {current && (
        <Lightbox
          media={current}
          mediaList={items}
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
          // Album chung: chỉ thao tác được trên ảnh của chính mình.
          onToggleFavorite={
            currentIsMine
              ? async () => {
                  await handleFavorite([current.id], !current.isFavorite);
                  void refresh();
                }
              : undefined
          }
          onAddToAlbum={
            currentIsMine ? () => openAddToAlbum([current.id]) : undefined
          }
          onDelete={
            currentIsMine
              ? async () => {
                  setSelectedIndex(null);
                  await handleDelete([current.id]);
                  void refresh();
                }
              : undefined
          }
        />
      )}

      <AddMediaDialog
        open={dialog === "add"}
        onOpenChange={(open) => setDialog(open ? "add" : null)}
        onConfirm={async (mediaIds) => {
          await addAlbumMedia(album.id, mediaIds);
          await refresh();
        }}
      />
      <ShareAlbumDialog
        album={album}
        open={dialog === "share"}
        onOpenChange={(open) => setDialog(open ? "share" : null)}
      />
      <AlbumFormDialog
        album={album}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        busy={busy}
        destructive={confirm !== "convert"}
        title={confirm ? t(`albums.confirm.${confirm}.title`) : ""}
        description={
          confirm
            ? t(`albums.confirm.${confirm}.desc`, {
                n: selected.size,
                name: album.name,
              })
            : ""
        }
        confirmLabel={confirm ? t(`albums.confirm.${confirm}.action`) : ""}
        onConfirm={confirmAction}
      />
    </div>
  );
};
