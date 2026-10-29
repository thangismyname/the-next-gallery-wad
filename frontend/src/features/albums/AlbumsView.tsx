import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Images,
  type LucideIcon,
  Plus,
  ScanSearch,
  Sparkles,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Album,
  type AutoAlbumGroup,
  albumsQueryKey,
  autoAlbumsQueryKey,
  fetchAlbums,
  fetchAutoAlbums,
  respondAlbumInvitation,
} from "@/services/albums";
import { AlbumCard } from "./components/AlbumCard";
import { AlbumFormDialog } from "./components/AlbumFormDialog";
import { AutoAlbumCard, AutoAlbumTile } from "./components/AutoAlbumCard";

const AUTO_ICONS: Record<AutoAlbumGroup, LucideIcon> = {
  type: Images,
  content: Tags,
  time: CalendarDays,
  objects: ScanSearch,
};

// Nhóm nhiều album (tag, tháng, vật thể) chỉ hiện 2 hàng đầu (lưới 5 cột) — bấm "Xem tất cả" để mở.
const AUTO_PREVIEW = 10;

const GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/**
 * Trang Albums: lời mời · album thông minh (AI) · album của tôi · được chia sẻ
 * · album tự động (mọi ảnh trong thư viện đều nằm trong ít nhất 1 album).
 */
export const AlbumsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<AutoAlbumGroup>>(new Set());
  const toggleExpanded = (group: AutoAlbumGroup) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: albumsQueryKey,
    queryFn: fetchAlbums,
  });

  // Album tự động tải riêng — lỗi / chậm không chặn album của người dùng.
  const autoQuery = useQuery({
    queryKey: autoAlbumsQueryKey,
    queryFn: fetchAutoAlbums,
  });
  const autoGroups = autoQuery.data?.filter((g) => g.albums.length > 0) ?? [];

  const smart = data?.owned.filter((a) => a.kind === "smart") ?? [];
  const manual = data?.owned.filter((a) => a.kind === "manual") ?? [];
  const isEmpty =
    data &&
    data.owned.length + data.shared.length + data.invitations.length === 0 &&
    autoGroups.length === 0;

  const respond = async (album: Album, accept: boolean) => {
    setRespondingId(album.id);
    try {
      await respondAlbumInvitation(album.id, accept);
      await queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      if (accept) navigate(`/albums/${album.id}`);
    } finally {
      setRespondingId(null);
    }
  };

  const section = (title: string, albums: Album[], extra?: React.ReactNode) =>
    albums.length > 0 && (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {extra}
          {title}
          <span className="font-normal text-muted-foreground">
            ({albums.length})
          </span>
        </h2>
        <div className={GRID}>
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              onRespond={album.pending ? respond : undefined}
              responding={respondingId === album.id}
            />
          ))}
        </div>
      </section>
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Mobile: tiêu đề co lại (phụ đề tối đa 2 dòng), nút "Album mới" chỉ còn icon */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex aspect-square size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight text-foreground">
              {t("albums.title")}
            </h1>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {t("albums.subtitle")}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreating(true)}
          aria-label={t("albums.newAlbum")}
          title={t("albums.newAlbum")}
          className="shrink-0 max-sm:size-10 max-sm:px-0"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t("albums.newAlbum")}</span>
        </Button>
      </div>

      {isPending ? (
        <div className={GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-xl bg-muted/40"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
          {t("albums.loadFailed")}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t("trash.retry")}
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <FolderOpen className="size-10 animate-float text-muted-foreground/40" />
          <p className="text-sm">{t("albums.empty")}</p>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t("albums.newAlbum")}
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {section(t("albums.invitations"), data.invitations)}
          {section(
            t("albums.smartSection"),
            smart,
            <Sparkles className="size-4 text-primary" />,
          )}
          {section(t("albums.mine"), manual)}
          {section(t("albums.sharedWithMe"), data.shared)}

          {/* Album tự động — mỗi nhóm 1 hàng cuộn ngang */}
          {autoGroups.map((group) => {
            const Icon = AUTO_ICONS[group.id];
            return (
              <section key={group.id} className="space-y-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-primary" />
                    {t(`albums.auto.groups.${group.id}`)}
                    <span className="font-normal text-muted-foreground">
                      ({group.albums.length})
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(`albums.auto.groupHints.${group.id}`)}
                  </p>
                </div>
                {/* Loại media chỉ có ≤ 4 album → thẻ ngang gọn; nhóm khác = lưới như album thường */}
                {group.id === "type" ? (
                  <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-4">
                    {group.albums.map((album) => (
                      <AutoAlbumTile key={album.key} album={album} />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className={GRID}>
                      {(expanded.has(group.id)
                        ? group.albums
                        : group.albums.slice(0, AUTO_PREVIEW)
                      ).map((album) => (
                        <AutoAlbumCard key={album.key} album={album} />
                      ))}
                    </div>
                    {group.albums.length > AUTO_PREVIEW && (
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpanded(group.id)}
                        >
                          {expanded.has(group.id) ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                          {expanded.has(group.id)
                            ? t("albums.auto.showLess")
                            : t("albums.auto.showAll", {
                                n: group.albums.length,
                              })}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AlbumFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(album) => navigate(`/albums/${album.id}`)}
      />
    </div>
  );
};
