import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Images, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { useSelectionStore } from "@/hooks/useSelectionStore";
import {
  type Album,
  addAlbumMedia,
  albumsQueryKey,
  fetchAlbums,
} from "@/services/albums";
import { AlbumFormDialog } from "./AlbumFormDialog";

/**
 * "Thêm vào album" — mount toàn app (MainLayout), mở bằng
 * useGalleryActionsStore.openAddToAlbum(ids) từ thanh chọn ảnh / Lightbox.
 * Chỉ liệt kê album thường mà mình được thêm ảnh (owner / editor).
 */
export const AddToAlbumDialog: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ids = useGalleryActionsStore((s) => s.addToAlbumIds);
  const close = useGalleryActionsStore((s) => s.closeAddToAlbum);
  const clearSelection = useSelectionStore((s) => s.clear);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const open = ids !== null;

  const { data, isPending } = useQuery({
    queryKey: albumsQueryKey,
    queryFn: fetchAlbums,
    enabled: open,
  });
  const targets = [...(data?.owned ?? []), ...(data?.shared ?? [])].filter(
    (a) => a.kind === "manual" && (a.role === "owner" || a.role === "editor"),
  );

  const finish = () => {
    clearSelection();
    setDoneId(null);
    setError(null);
    close();
  };

  const addTo = async (album: Album) => {
    if (!ids || busyId) return;
    setBusyId(album.id);
    setError(null);
    try {
      await addAlbumMedia(album.id, ids);
      await queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      setDoneId(album.id);
      setTimeout(finish, 600);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Dialog
        open={open && !creating}
        onOpenChange={(next) => !next && finish()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("albums.addTo")}</DialogTitle>
            <DialogDescription>
              {t("albums.addToDesc", { n: ids?.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/60"
            >
              <span className="flex size-12 items-center justify-center rounded-lg border border-dashed border-border">
                <Plus className="size-5 text-muted-foreground" />
              </span>
              <span className="text-sm font-medium">
                {t("albums.newAlbum")}
              </span>
            </button>

            {isPending
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg bg-muted/40" />
                ))
              : targets.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void addTo(album)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/60 disabled:opacity-60"
                  >
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {album.coverUrl ? (
                        <img
                          src={album.coverUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Images className="absolute top-1/2 left-1/2 size-5 -translate-1/2 text-muted-foreground/50" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {album.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t("albums.photoCount", { n: album.mediaCount })}
                        {album.role !== "owner" &&
                          ` · ${album.owner.name ?? ""}`}
                      </span>
                    </span>
                    {busyId === album.id && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    {doneId === album.id && (
                      <Check className="size-4 text-emerald-500" />
                    )}
                  </button>
                ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>

      <AlbumFormDialog
        open={creating}
        onOpenChange={setCreating}
        initial={{ mediaIds: ids ?? [] }}
        onSaved={() => {
          setCreating(false);
          finish();
        }}
      />
    </>
  );
};
