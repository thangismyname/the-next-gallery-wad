import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, Images, Link2Off, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { fetchPublicAlbum } from "@/services/albums";
import { toMedia, downloadUrl } from "@/services/media";
import { getInitials } from "@/utils/string";

const PAGE_SIZE = 60;

/**
 * Album qua link công khai (/s/:token) — không cần đăng nhập, không có
 * MainLayout. Quyền "download" → hiện nút tải ảnh đang xem.
 */
export const PublicAlbumView: React.FC = () => {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["public-album", token],
    queryFn: ({ pageParam }) =>
      fetchPublicAlbum(token, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    retry: false,
    staleTime: Infinity, // mỗi lần tải lại trang đầu = 1 lượt xem
  });

  const first = query.data?.pages[0];
  const raw = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const items = useMemo(() => raw.map(toMedia), [raw]);
  const current = selectedIndex !== null ? items[selectedIndex] : null;
  const errorCode = (query.error as { code?: string } | null)?.code;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="font-heading text-lg font-semibold">
            {t("app.name")}
          </Link>
          <div className="flex items-center gap-1">
            <LanguageToggle className="inline-flex" />
            <ThemeToggle className="inline-flex" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {query.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-square rounded-lg bg-muted/40"
              />
            ))}
          </div>
        ) : query.isError || !first ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
            <Link2Off className="size-10 animate-float text-muted-foreground/40" />
            <p className="text-sm">
              {errorCode === "LINK_EXPIRED"
                ? t("albums.public.expired")
                : errorCode === "LINK_EXHAUSTED"
                  ? t("albums.public.exhausted")
                  : t("albums.public.notFound")}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {first.album.name}
              </h1>
              {first.album.description && (
                <p className="text-sm text-muted-foreground">
                  {first.album.description}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar className="size-6">
                  {first.album.owner.image && (
                    <AvatarImage src={first.album.owner.image} alt="" />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(first.album.owner.name)}
                  </AvatarFallback>
                </Avatar>
                {t("albums.public.sharedBy", {
                  name: first.album.owner.name ?? "",
                })}
                {" · "}
                {t("albums.photoCount", { n: first.total })}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
                <Images className="size-10 animate-float text-muted-foreground/40" />
                {t("albums.emptyAlbum")}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
                {items.map((media, i) => (
                  <ImageCard
                    key={media.id}
                    media={media}
                    onClick={() => setSelectedIndex(i)}
                  />
                ))}
              </div>
            )}

            {query.hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {t("mediaPicker.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {current && (
        <>
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
            canDownload={false}
          />
          {first?.album.permission === "download" && (
            <a
              href={downloadUrl(current.url)}
              className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black shadow-lg hover:bg-white"
            >
              <Download className="size-4" />
              {t("albums.public.download")}
            </a>
          )}
        </>
      )}
    </div>
  );
};
