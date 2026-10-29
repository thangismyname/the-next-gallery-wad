import { useEffect, useMemo, useState } from "react";
import { createMoment, updateDraftMoment } from "@/services/moments";
import { Moment, MomentTemplate, MomentVisibility } from "@/types";
import type { MomentCreateMode } from "./components/MomentTemplatePicker";

const SLOT_COUNT: Record<MomentTemplate, number> = {
  single: 1,
  duo_square: 2,
  trio_wide: 3,
};

/**
 * Bản nháp của dialog tạo / sửa moment: template (1 / 2 / 3 ô), chế độ (tự
 * đăng nhiều ảnh hay "Cùng bạn"), ảnh của mình, bạn được mời, caption, ai xem.
 * Tính giới hạn số ảnh / số bạn theo số ô, và gửi đúng API (tạo mới · ghép
 * cùng bạn · sửa nháp). Mở dialog → nạp từ `editMoment` hoặc làm trống.
 */
export function useMomentDraft({
  open,
  editMoment,
  onCreated,
  onClose,
}: {
  open: boolean;
  editMoment?: Moment | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const isEditing = Boolean(editMoment);
  const [template, setTemplate] = useState<MomentTemplate>("single");
  const [mode, setMode] = useState<MomentCreateMode>("collab");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<MomentVisibility>("circle");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotCount = SLOT_COUNT[template];
  const isCollabTemplate = template !== "single";

  // Khi mở dialog: seed dữ liệu từ draft (edit mode) hoặc reset (tạo mới).
  useEffect(() => {
    if (!open) return;
    if (editMoment) {
      const editSlotCount =
        SLOT_COUNT[editMoment.template === "single" ? "duo_square" : editMoment.template] ??
        SLOT_COUNT.duo_square;
      // Creator của draft (có thể giữ 1-N slot) + các bạn được mời (theo slot, dedupe).
      const collaborators = [
        ...new Set(
          (editMoment.slots ?? [])
            .filter((s) => s.userId && s.userId !== editMoment.userId)
            .map((s) => s.userId),
        ),
      ];
      const ownPhotoIds = (editMoment.slots ?? [])
        .filter((s) => s.userId === editMoment.userId && s.mediaId)
        .map((s) => s.mediaId as string);
      setTemplate(editMoment.template !== "single" ? editMoment.template : "duo_square");
      setMode("collab");
      setSelectedIds(ownPhotoIds);
      setFriendIds(
        collaborators.slice(
          0,
          Math.max(1, editSlotCount - Math.max(ownPhotoIds.length, 1)),
        ),
      );
      setCaption(editMoment.caption ?? "");
      setVisibility(editMoment.visibility ?? "circle");
      setError(null);
    } else {
      setTemplate("single");
      setMode("collab");
      setSelectedIds([]);
      setFriendIds([]);
      setCaption("");
      setVisibility("circle");
      setError(null);
    }
  }, [open, editMoment]);

  // Số ảnh tối đa chọn được:
  // - single/self: đủ slot
  // - collab: slotCount trừ slot đã giành cho bạn bè (nhưng phải chừa tối thiểu
  //   1 slot cho ít nhất 1 bạn — creator không thể chiếm hết khi đang chế độ "Cùng bạn").
  // Ảnh chưa chọn? Giữ `photoLimit >= 1` để luôn còn chỗ cho bạn bè.
  const photoLimit = isCollabTemplate
    ? mode === "self"
      ? slotCount
      : Math.max(1, Math.min(slotCount - friendIds.length, slotCount - 1))
    : 1;
  // Collab: chọn bao nhiêu bạn tuỳ theo số ảnh của mình (creator phải chừa ≥1 slot).
  const maxFriendCount = isCollabTemplate && mode === "collab"
    ? Math.max(1, slotCount - Math.max(selectedIds.length, 1))
    : 0;

  const reset = () => {
    setTemplate("single");
    setMode("collab");
    setSelectedIds([]);
    setFriendIds([]);
    setCaption("");
    setVisibility("circle");
    setError(null);
  };

  const toggleMedia = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      // Chọn 1 ảnh (single / collab chừa đúng 1 slot): bấm ảnh khác sẽ thay thế.
      if (photoLimit === 1) return [id];
      return prev.length >= photoLimit ? prev : [...prev, id];
    });
  };

  const toggleFriend = (id: string) => {
    setFriendIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return prev.length >= maxFriendCount ? prev : [...prev, id];
    });
  };

  const canPost = useMemo(() => {
    if (isCollabTemplate && mode === "collab") {
      return (
        selectedIds.length >= 1 &&
        friendIds.length >= 1 &&
        selectedIds.length + friendIds.length <= slotCount
      );
    }
    return selectedIds.length >= photoLimit;
  }, [isCollabTemplate, mode, selectedIds, friendIds, photoLimit, slotCount]);

  const handlePost = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    setError(null);
    try {
      if (isEditing && editMoment) {
        await updateDraftMoment(editMoment.id, {
          template,
          mediaIds: selectedIds,
          collaboratorIds: friendIds,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else if (isCollabTemplate && mode === "collab") {
        await createMoment({
          template,
          mediaIds: selectedIds,
          collaboratorIds: friendIds,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else if (isCollabTemplate && mode === "self") {
        await createMoment({
          template,
          mediaIds: selectedIds,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else {
        await createMoment({
          template: "single",
          mediaId: selectedIds[0],
          caption: caption.trim() || undefined,
          visibility,
        });
      }
      onCreated();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return {
    isEditing,
    template,
    setTemplate,
    mode,
    setMode,
    selectedIds,
    setSelectedIds,
    friendIds,
    setFriendIds,
    caption,
    setCaption,
    visibility,
    setVisibility,
    posting,
    error,
    slotCount,
    isCollabTemplate,
    photoLimit,
    maxFriendCount,
    reset,
    toggleMedia,
    toggleFriend,
    canPost,
    handlePost,
  };
}
