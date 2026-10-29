import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, FolderPlus, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlbumFormDialog } from "@/features/albums/components/AlbumFormDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageCard } from "@/features/gallery/components/ImageCard";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { useDebounce } from "@/hooks/useDebounce";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { GRID_DENSITY_CLASS, useGridDensity } from "@/hooks/useGridDensity";
import { cn } from "@/lib/utils";
import {
  fetchTagMedia,
  fetchTagSummary,
  tagMediaQueryKey,
  tagSummaryQueryKey,
  toMedia,
} from "@/services/media";
import { TAG_ICONS } from "../tagCatalog";
import { ConfidenceThreshold } from "./ConfidenceThreshold";

const PAGE_SIZE = 60;

type Props = { tag: string; onBack: () => void };

/** Ảnh của 1 tag: xếp theo độ tin cậy, badge %, đổi ngưỡng bằng thanh trượt. */
export const TagMediaGrid: React.FC<Props> = ({ tag, onBack }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const density = useGridDensity((s) => s.density);
  const Icon = TAG_ICONS[tag];

  // null = ngưỡng tự động (tối ưu F1 khi train) của tag.
  const [threshold, setThreshold] = useState<number | null>(null);
  const minConfidence = useDebounce(threshold, 250);

  const { data: summary } = useQuery({
    queryKey: tagSummaryQueryKey,
    queryFn: fetchTagSummary,
    staleTime: 30_000,
  });
  const autoThreshold = summary?.find((s) => s.tag === tag)?.threshold ?? 0.5;

  const query = useInfiniteQuery({
    queryKey: tagMediaQueryKey(tag, minConfidence),
    queryFn: ({ pageParam }) =>
      fetchTagMedia(tag, {
        minConfidence,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: (previous) => previous,
  });

  const raw = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const items = useMemo(() => raw.map(toMedia), [raw]);
  const total = query.data?.pages[0]?.total ?? 0;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const navigate = useNavigate();
  const current = selectedIndex !== null ? items[selectedIndex] : null;
  const { handleDelete, handleFavorite } = useGalleryActions();
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["ai", "tags"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={t("studio.back")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Icon className="size-5 text-primary" />
          <div>
            <h2 className="font-semibold leading-tight">
              {t(`studio.tags.${tag}`)}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("studio.photoCount", { n: total })}
            </p>
          </div>
          {query.isFetching && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceThreshold
            value={threshold}
            autoValue={autoThreshold}
            onChange={setThreshold}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={total === 0}
            onClick={() => setCreatingAlbum(true)}
          >
            <FolderPlus className="size-4" />
            {t("studio.createAlbum")}
          </Button>
        </div>
      </div>

      {/* Album thông minh theo tag này (+ ngưỡng đang chọn) — ảnh mới tự vào. */}
      <AlbumFormDialog
        open={creatingAlbum}
        onOpenChange={setCreatingAlbum}
        initial={{
          name: t(`studio.tags.${tag}`),
          smartRule: { type: "tags", tags: [tag], minConfidence: threshold },
        }}
        onSaved={(album) => navigate(`/albums/${album.id}`)}
      />

      {query.isPending ? (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-lg bg-muted/40"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t("studio.emptyTag")}
        </p>
      ) : (
        <div className={cn("grid gap-2 sm:gap-3", GRID_DENSITY_CLASS[density])}>
          {items.map((media, i) => (
            <div key={media.id} className="relative">
              <ImageCard media={media} onClick={() => setSelectedIndex(i)} />
              <ConfidenceBadge value={raw[i]?.score ?? 0} />
            </div>
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
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
            refresh();
          }}
          onAddToAlbum={() => openAddToAlbum([current.id])}
          onDelete={async () => {
            setSelectedIndex(null);
            await handleDelete([current.id]);
            refresh();
          }}
        />
      )}
    </div>
  );
};

/** Độ tin cậy của tag trên ảnh — xanh khi model rất chắc (≥ 80%). */
function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm",
        value >= 0.8 ? "bg-emerald-600/85" : "bg-black/60",
      )}
    >
      {Math.round(value * 100)}%
    </span>
  );
}
