// Dialog chọn ảnh dùng chung (Album, Avatar, Gửi nhanh…). 2 cách dùng:
//   1. Controlled: <MediaPickerDialog open onOpenChange onConfirm={items => …} />
//   2. Gọi hàm:   const items = await pickMedia({ max: 1 })  (null = huỷ) —
//      pickMedia.ts + <MediaPickerHost /> (đặt sẵn trong MainLayout).
import { type MediaFilter, type MediaListItem } from "@tng/shared";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaPicker } from "./MediaPicker";
import { useMediaSelection } from "./useMediaSelection";

export interface MediaPickerOptions {
  title?: string;
  description?: string;
  /** Nhãn nút xác nhận theo số ảnh đã chọn. */
  confirmLabel?: (count: number) => string;
  /** 1 = chọn 1 ảnh; bỏ trống = không giới hạn. */
  max?: number;
  initialSelected?: MediaListItem[];
  initialFilter?: MediaFilter;
  /** Cho xác nhận khi chưa chọn gì (vd bỏ hết ảnh thư viện khỏi danh sách gửi). */
  allowEmpty?: boolean;
}

// Kéo header để di chuyển, kéo góc dưới-phải để đổi cỡ, nháy đúp góc = mặc định
// (giống Spotlight) — lưu localStorage, dùng chung cho mọi nơi mở picker.
const DEFAULT_WIDTH = 820;
const defaultHeight = () =>
  typeof window === "undefined" ? 640 : Math.min(760, Math.round(window.innerHeight * 0.82));

interface MediaPickerDialogProps extends MediaPickerOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lỗi ném ra → dialog giữ nguyên để thử lại. */
  onConfirm: (items: MediaListItem[]) => void | Promise<void>;
}

export const MediaPickerDialog: React.FC<MediaPickerDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  max,
  initialSelected,
  initialFilter,
  allowEmpty,
}) => {
  const { t } = useTranslation();
  const selection = useMediaSelection(max, initialSelected);
  const [busy, setBusy] = useState(false);
  const { reset } = selection;

  // Mỗi lần mở: bắt đầu từ lựa chọn ban đầu của nơi gọi.
  useEffect(() => {
    if (open) reset(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (next: boolean) => {
    if (!busy) onOpenChange(next);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(selection.items);
      onOpenChange(false);
    } catch {
      // nơi gọi tự báo lỗi; giữ dialog để thử lại
    } finally {
      setBusy(false);
    }
  };

  const count = selection.ids.size;
  return (
    <Dialog open={open} onOpenChange={close}>
      <ResizableDialogContent storageKey="tng.mediaPicker" defaultWidth={DEFAULT_WIDTH} defaultHeight={defaultHeight}>
        <DialogHeader data-drag-handle className="pr-14 pb-3" title={t("search.dragHint")}>
          <DialogTitle>{title ?? t("mediaPicker.title")}</DialogTitle>
          <DialogDescription>
            {description ?? (max === 1 ? t("mediaPicker.descriptionOne") : t("mediaPicker.description"))}
          </DialogDescription>
        </DialogHeader>

        {/* Chỉ mount khi mở → đóng dialog là gỡ hết ảnh khỏi DOM. Lưới giãn theo cỡ dialog. */}
        {open && (
          <MediaPicker
            className="min-h-0 flex-1 px-6"
            selectedIds={selection.ids}
            selectedItems={selection.items}
            onToggle={selection.toggle}
            onToggleMany={max === 1 ? undefined : selection.toggleMany}
            max={max}
            initialFilter={initialFilter}
            gridClassName="h-auto min-h-0 flex-1"
          />
        )}

        <DialogFooter className="items-center border-t border-border/50 pt-3 pb-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {count > 0 && (
              <button type="button" className="hover:text-foreground" onClick={() => reset([])}>
                {t("mediaPicker.clear", { count })}
              </button>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => close(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || (!allowEmpty && count === 0)} onClick={() => void confirm()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel ? confirmLabel(count) : t("mediaPicker.confirm", { count })}
            </Button>
          </div>
        </DialogFooter>

      </ResizableDialogContent>
    </Dialog>
  );
};
