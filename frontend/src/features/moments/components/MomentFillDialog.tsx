import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/media-picker/MediaPicker";
import { fillMomentSlots } from "@/services/moments";
import type { Moment } from "@tng/shared";
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
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Đổi moment → chọn lại từ đầu (reset state khi prop đổi, không cần effect).
  const [shownId, setShownId] = useState<string | null>(null);
  if ((target?.id ?? null) !== shownId) {
    setShownId(target?.id ?? null);
    setPickedIds([]);
    setError(null);
  }

  const pendingPickCount = target?.myPendingSlots?.length ?? 1;
  const pickedIdSet = useMemo(() => new Set(pickedIds), [pickedIds]);

  const togglePick = (id: string) =>
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= pendingPickCount) return prev;
      return [...prev, id];
    });

  const submit = async () => {
    if (!target || (target.myPendingSlots?.length ?? 0) === 0) return;
    if (pickedIds.length === 0 || posting) return;
    setPosting(true);
    setError(null);
    try {
      const result = await fillMomentSlots(target.id, pickedIds);
      setPickedIds([]);
      onFilled(result.complete);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden sm:max-w-md"
        data-slot="moment-fill-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("moments.fillSlotTitle", { n: pendingPickCount })}</DialogTitle>
          <DialogDescription>
            {t("moments.fillSlotDesc", { user: target?.userName ?? "", n: pendingPickCount })}
          </DialogDescription>
        </DialogHeader>

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
            gridClassName="h-64"
            onToggle={(item) => togglePick(item.id)}
          />
        </DialogBody>

        <DialogFooter className="border-t border-border/50 pt-4">
          <Button variant="outline" onClick={onClose} disabled={posting}>
            {t("moments.cancel")}
          </Button>
          <Button onClick={submit} disabled={pickedIds.length === 0 || posting}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : t("moments.confirmFill")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
