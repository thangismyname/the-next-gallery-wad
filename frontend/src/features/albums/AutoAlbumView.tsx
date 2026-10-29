import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, FolderPlus, Images, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { GRID_DENSITY_CLASS, useGridDensity } from "@/hooks/useGridDensity";
import { cn } from "@/lib/utils";
import {
  albumsQueryKey,
  autoAlbumMediaQueryKey,
  autoAlbumsQueryKey,
  fetchAutoAlbumMedia,
  fetchAutoAlbums,
  saveAutoAlbum,
} from "@/services/albums";
import { toMedia } from "@/services/media";
import { autoAlbumName } from "./autoAlbums";

const PAGE_SIZE = 60;

/** Trang 1 album tự động: chỉ đọc, có thể lưu thành album thường. */
export const AutoAlbumView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const density = useGridDensity((s) => s.density);
  const { handleFavorite, handleDelete } = useGalleryActions();
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setSelectedIndex(null);
  }

  // Tên + bìa lấy từ danh sách (đã cache khi đi từ trang Albums).
  const groupsQuery = useQuery({
    queryKey: autoAlbumsQueryKey,
    queryFn: fetchAutoAlbums,
  });
  const album = groupsQuery.data
    ?.flatMap((g) => g.albums)
    .find((a) => a.key === key);

  const mediaQuery = useInfiniteQuery({
    queryKey: autoAlbumMediaQueryKey(key),
    queryFn: ({ pageParam }) =>
      fetchAutoAlbumMedia(key, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    retry: false,
  });
  const items = useMemo(
    () => mediaQuery.data?.pages.flatMap((p) => p.items.map(toMedia)) ?? [],
    [mediaQuery.data],
  );
  const total = mediaQuery.data?.pages[0]?.total ?? album?.count ?? 0;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: autoAlbumsQueryKey });

  const name = album ? autoAlbumName(album, t, i18n.language) : "";

  const save = async () => {
    setSaving(true);
    try {
      const created = await saveAutoAlbum(key, name);
      await queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      navigate(`/albums/${created.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (groupsQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Skeleton className="mb-6 h-36 rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!album || mediaQuery.isError) {
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

  const current = selectedIndex !== null ? items[selectedIndex] : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6">
      <div className="mb-6 space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/albums">
            <ArrowLeft className="size-4" />
            {t("albums.title")}
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-36">
            {album.coverUrl ? (
              <img
                src={album.coverUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <Images className="absolute top-1/2 left-1/2 size-10 -translate-1/2 text-muted-foreground/40" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" />
              {t(`albums.auto.groups.${album.group}`)}
            </Badge>
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("albums.photoCount", { n: total })} ·{" "}
              {t("albums.auto.readOnly")}
            </p>
          </div>

          <Button variant="outline" disabled={saving} onClick={save}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderPlus className="size-4" />
            )}
            {t("albums.auto.save")}
          </Button>
        </div>
      </div>

      {mediaQuery.isPending ? (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-lg bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {items.map((media, i) => (
            <ImageCard
              key={media.id}
              media={media}
              onClick={() => setSelectedIndex(i)}
            />
          ))}
        </div>
      )}

      {mediaQuery.hasNextPage && (
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
          onToggleFavorite={async () => {
            await handleFavorite([current.id], !current.isFavorite);
            void refresh();
          }}
          onAddToAlbum={() => openAddToAlbum([current.id])}
          onDelete={() => {
            setSelectedIndex(null);
            handleDelete([current.id]);
          }}
        />
      )}
    </div>
  );
};
