import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  type AlbumMediaItem,
  fetchAlbumMedia,
  reorderAlbumMedia,
} from "@/services/albums";

const PAGE_SIZE = 200;

type Props = { albumId: string; onDone: (saved: boolean) => void };

/**
 * Chế độ sắp xếp: tải TOÀN BỘ ảnh của album rồi kéo thả (chuột, cảm ứng, bàn
 * phím: Space để nhấc, phím mũi tên để di chuyển). Lưu = gửi cả danh sách.
 */
export const AlbumReorderGrid: React.FC<Props> = ({ albumId, onDone }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<AlbumMediaItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: AlbumMediaItem[] = [];
      for (;;) {
        const page = await fetchAlbumMedia(albumId, {
          limit: PAGE_SIZE,
          offset: all.length,
        });
        all.push(...page.items);
        if (page.items.length === 0 || all.length >= page.total) break;
      }
      if (!cancelled) setItems(all);
    })().catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!items || !over || active.id === over.id) return;
    const from = items.findIndex((m) => m.id === active.id);
    const to = items.findIndex((m) => m.id === over.id);
    setItems(arrayMove(items, from, to));
    setDirty(true);
  };

  const save = async () => {
    if (!items) return;
    setSaving(true);
    setError(null);
    try {
      await reorderAlbumMedia(
        albumId,
        items.map((m) => m.id),
      );
      onDone(true);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 pl-3 glass">
        <p className="text-sm text-muted-foreground">
          {t("albums.reorder.hint")}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onDone(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("albums.reorder.save")}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!items ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-lg bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((m) => m.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((media, index) => (
                <SortableTile key={media.id} media={media} index={index} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

function SortableTile({
  media,
  index,
}: {
  media: AlbumMediaItem;
  index: number;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: media.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={t("albums.reorder.item", {
        n: index + 1,
        title: media.title ?? "",
      })}
      className={cn(
        "relative aspect-square cursor-grab touch-none overflow-hidden rounded-lg bg-muted select-none active:cursor-grabbing",
        isDragging && "z-10 opacity-80 shadow-xl ring-2 ring-primary",
      )}
    >
      <img
        src={media.thumbnailUrl}
        alt=""
        draggable={false}
        className="size-full object-cover"
      />
      <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[11px] font-medium text-white tabular-nums">
        {index + 1}
      </span>
      <GripVertical className="absolute top-1 right-1 size-4 text-white drop-shadow" />
    </div>
  );
}
