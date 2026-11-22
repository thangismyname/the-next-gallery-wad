import { useEffect, useMemo, useState } from "react";
import { createMoment, updateDraftMoment } from "@/services/moments";
import { framingOrNull, moveInCells, toggleInCells, Moment, MomentFraming, MomentTemplate, MomentVisibility, type MediaListItem } from "@tng/shared";
import type { MomentCreateMode } from "./components/MomentTemplatePicker";
import type { FramerPhoto } from "./components/MomentFramer";

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
  // Ảnh của mình theo ô: cells[i] = mediaId ở ô i (null = ô trống / của bạn bè).
  const [cells, setCells] = useState<(string | null)[]>([]);
  // Ảnh đã chọn (để vẽ bộ chỉnh khung) + khung từng ảnh — chỉ gửi lên khi Đăng.
  const [photos, setPhotos] = useState<Record<string, FramerPhoto>>({});
  const [framings, setFramings] = useState<Record<string, MomentFraming>>({});
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<MomentVisibility>("circle");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotCount = SLOT_COUNT[template];
  const isCollabTemplate = template !== "single";
  const slotCells = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => cells[i] ?? null),
    [cells, slotCount],
  );
  /** Ảnh đã chọn theo thứ tự ô (trên → dưới). */
  const selectedIds = useMemo(() => slotCells.filter((id): id is string => Boolean(id)), [slotCells]);
  /** Đặt danh sách ảnh vào các ô đầu (vd xoá hết khi đổi template). */
  const setSelectedIds = (ids: string[]) => setCells(ids);

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
      const ownSlots = (editMoment.slots ?? []).filter((s) => s.userId === editMoment.userId && s.mediaId);
      setPhotos(
        Object.fromEntries(
          ownSlots.map((s) => [
            s.mediaId!,
            { id: s.mediaId!, src: s.displayUrl ?? s.thumbnailUrl ?? "", mediaType: s.mediaType },
          ]),
        ),
      );
      setFramings(Object.fromEntries(ownSlots.filter((s) => s.framing).map((s) => [s.mediaId!, s.framing!])));
      setTemplate(editMoment.template !== "single" ? editMoment.template : "duo_square");
      setMode("collab");
      const seeded: (string | null)[] = [];
      for (const slot of ownSlots) seeded[slot.slotIndex] = slot.mediaId;
      setCells(Array.from(seeded, (id) => id ?? null));
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
      setCells([]);
      setPhotos({});
      setFramings({});
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
    setPhotos({});
    setFramings({});
    setFriendIds([]);
    setCaption("");
    setVisibility("circle");
    setError(null);
  };

  const toggleMedia = (item: MediaListItem) => {
    const { id } = item;
    setPhotos((prev) => ({
      ...prev,
      [id]: { id, src: item.displayUrl ?? item.thumbnailUrl, mediaType: item.mediaType },
    }));
    setCells((prev) => toggleInCells(prev, id, slotCount, photoLimit));
  };

  const setFraming = (id: string, framing: MomentFraming) => setFramings((prev) => ({ ...prev, [id]: framing }));

  /** Chuyển ảnh ở ô `from` sang ô `to` (đổi chỗ nếu ô đó có ảnh / trống thì dời sang). */
  const moveCell = (from: number, to: number) => setCells((prev) => moveInCells(prev, from, to, slotCount));

  const framedPhotos = selectedIds.map((id) => photos[id]).filter((p): p is FramerPhoto => Boolean(p));
  const framingPayload = selectedIds.map((id) => framingOrNull(framings[id]));
  /** Ô của từng ảnh mình (khớp `selectedIds`). */
  const creatorSlots = slotCells.flatMap((id, i) => (id ? [i] : []));
  /** Bố cục cho MomentFramer: số = index trong framedPhotos. */
  const framerLayout = slotCells.map((id) => (id ? selectedIds.indexOf(id) : null));

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
          framings: framingPayload,
          creatorSlots,
          collaboratorIds: friendIds,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else if (isCollabTemplate && mode === "collab") {
        await createMoment({
          template,
          mediaIds: selectedIds,
          framings: framingPayload,
          creatorSlots,
          collaboratorIds: friendIds,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else if (isCollabTemplate && mode === "self") {
        await createMoment({
          template,
          mediaIds: selectedIds,
          framings: framingPayload,
          caption: caption.trim() || undefined,
          visibility,
        });
      } else {
        await createMoment({
          template: "single",
          mediaId: selectedIds[0],
          framings: framingPayload,
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
    framedPhotos,
    framerLayout,
    framings,
    setFraming,
    moveCell,
    canPost,
    handlePost,
  };
}
