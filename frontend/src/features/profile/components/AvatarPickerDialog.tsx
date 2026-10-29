import { useState } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/gallery/components/MediaPicker";
import { MediaListItem } from "@/services/media";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL ảnh đại diện mới (bản 400px của ảnh/poster video đã chọn). */
  onPick: (imageUrl: string) => void;
};

/** Chọn ảnh đại diện từ ảnh đã có trong thư viện — chỉ chọn 1. */
export const AvatarPickerDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  onPick,
}) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<MediaListItem | null>(null);

  const close = (next: boolean) => {
    if (!next) setPicked(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profile.avatarPickTitle")}</DialogTitle>
          <DialogDescription>{t("profile.avatarPickDesc")}</DialogDescription>
        </DialogHeader>

        <MediaPicker
          selectedIds={new Set(picked ? [picked.id] : [])}
          onToggle={(item) => setPicked(picked?.id === item.id ? null : item)}
          gridClassName="max-h-72"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t("profile.cancel")}
          </Button>
          <Button
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              // URL ổn định (không phải URL ký có hạn) — backend chỉ phục vụ
              // khi ảnh này đang là avatar của chính chủ.
              onPick(`${API_URL}/profile/avatar/${picked.id}`);
              close(false);
            }}
          >
            {t("profile.avatarUse")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
