import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/media-picker/MediaPicker";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { fillMomentSlots } from "@/services/moments";
import { fillLayout, framingOrNull, type MediaListItem, type Moment, type MomentFraming } from "@tng/shared";
import { MomentFramer, type FramerPhoto } from "./MomentFramer";
import { cn } from "@/lib/utils";

type Props = {
  /** Moment có slot của mình chưa điền; null = đóng. */
  target: Moment | null;
  onClose: () => void;
  /** Điền xong — `complete` = moment đã đủ mọi slot (feed cần làm mới). */
  onFilled: (complete: boolean) => void;
};

/** Dialog chọn ảnh điền vào (các) slot của mình trong 1 moment collab. */
export const MomentFillDialog: React.FC<Props> = ({ target, onClose, onFilled }) => {
  const { t } = useTranslation();
  // Ô trống của mình → ảnh đặt vào đó.
  const [placed, setPlaced] = useState<Record<number, string>>({});
  // Ảnh đã chọn + khung từng ảnh (như dialog tạo moment) — chỉ gửi khi xác nhận.
  const [photos, setPhotos] = useState<Record<string, FramerPhoto>>({});
  const [framings, setFramings] = useState<Record<string, MomentFraming>>({});
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Đổi moment → chọn lại từ đầu (reset state khi prop đổi, không cần effect).
  const [shownId, setShownId] = useState<string | null>(null);
  if ((target?.id ?? null) !== shownId) {
    setShownId(target?.id ?? null);
    setPlaced({});
    setPhotos({});
    setFramings({});
    setError(null);
  }

  const pendingPickCount = target?.myPendingSlots?.length ?? 1;
  const mySlots = useMemo(() => [...(target?.myPendingSlots ?? [])].sort((a, b) => a - b), [target]);
  const pickedSlots = mySlots.filter((slot) => placed[slot]);
  /** Ảnh đã chọn theo thứ tự ô. */
  const pickedIds = pickedSlots.map((slot) => placed[slot]);
  const pickedIdSet = useMemo(() => new Set(Object.values(placed)), [placed]);

  const togglePick = ({ id, displayUrl, thumbnailUrl, mediaType }: MediaListItem) => {
    setPhotos((prev) => ({ ...prev, [id]: { id, src: displayUrl ?? thumbnailUrl, mediaType } }));
    setPlaced((prev) => {
      const at = Object.keys(prev).find((slot) => prev[Number(slot)] === id);
      if (at !== undefined) {
        const next = { ...prev };
        delete next[Number(at)];
        return next;
      }
      const free = mySlots.find((slot) => !prev[slot]);
      return free === undefined ? prev : { ...prev, [free]: id };
    });
  };

  /** Dời ảnh ở ô `from` sang ô trống khác của mình (có ảnh thì đổi chỗ). */
  const move = (from: number, to: number) =>
    setPlaced((prev) => {
      const next = { ...prev };
      const a = prev[from];
      const b = prev[to];
      delete next[from];
      delete next[to];
      if (a) next[to] = a;
      if (b) next[from] = b;
      return next;
    });
  const framedPhotos = pickedIds.map((id) => photos[id]).filter((p): p is FramerPhoto => Boolean(p));

  const submit = async () => {
    if (!target || (target.myPendingSlots?.length ?? 0) === 0) return;
    if (pickedIds.length === 0 || posting) return;
    setPosting(true);
    setError(null);
    try {
      const result = await fillMomentSlots(
        target.id,
        pickedIds,
        pickedIds.map((id) => framingOrNull(framings[id])),
        pickedSlots,
      );
      setPlaced({});
      onFilled(result.complete);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => !next && onClose()}>
      <ResizableDialogContent
        storageKey="tng.momentFill"
        defaultWidth={520}
        defaultHeight={() => (typeof window === "undefined" ? 600 : Math.min(680, Math.round(window.innerHeight * 0.8)))}
        data-slot="moment-fill-dialog"
      >
        <DialogHeader data-drag-handle title={t("search.dragHint")}>
          <DialogTitle>{t("moments.fillSlotTitle", { n: pendingPickCount })}</DialogTitle>
          <DialogDescription>
            {t("moments.fillSlotDesc", { user: target?.userName ?? "", n: pendingPickCount })}
          </DialogDescription>
        </DialogHeader>

        {/* Cuộn cả thân dialog; lưới ảnh cao theo cỡ dialog (--panel-h) như dialog tạo moment. */}
        <DialogBody className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("moments.selectPhoto")}</span>
            <span
              className={cn(
                "font-medium",
                pickedIds.length < pendingPickCount ? "text-muted-foreground" : "text-primary",
              )}
            >
              {pickedIds.length}/{pendingPickCount}
            </span>
          </div>
          <MediaPicker
            selectedIds={pickedIdSet}
            max={pendingPickCount}
            showCount={false}
            gridClassName="h-[max(16rem,calc(var(--panel-h)*0.5))]"
            onToggle={togglePick}
          />
          {target && framedPhotos.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{t("moments.framer.title")}</h3>
              <MomentFramer
                photos={framedPhotos}
                layout={fillLayout(target.slots, Object.fromEntries(pickedSlots.map((slot, i) => [slot, i])))}
                framings={framings}
                onFrame={(id, f) => setFramings((prev) => ({ ...prev, [id]: f }))}
                canPlace={(slot) => mySlots.includes(slot)}
                onMove={move}
              />
            </section>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-border/50 pt-4">
          <Button variant="outline" onClick={onClose} disabled={posting}>
            {t("moments.cancel")}
          </Button>
          <Button onClick={submit} disabled={pickedIds.length === 0 || posting}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : t("moments.confirmFill")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
};
