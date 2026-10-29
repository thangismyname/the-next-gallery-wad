import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaPicker } from "@/features/gallery/components/MediaPicker";
import type { MediaListItem } from "@/services/media";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mediaIds: string[]) => Promise<void>;
};

/** Chọn ảnh trong thư viện của mình để thêm vào album. */
export const AddMediaDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (item: MediaListItem) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) setSelected(new Set());
    onOpenChange(next);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm([...selected]);
      setSelected(new Set());
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("albums.addPhotos")}</DialogTitle>
          <DialogDescription>{t("albums.addPhotosDesc")}</DialogDescription>
        </DialogHeader>
        {open && (
          <MediaPicker
            selectedIds={selected}
            onToggle={toggle}
            gridClassName="max-h-[55vh] grid-cols-3 sm:grid-cols-5"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={selected.size === 0 || saving}
            onClick={() => void confirm()}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("albums.addCount", { n: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
