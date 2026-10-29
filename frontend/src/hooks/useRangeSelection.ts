import { useCallback, useEffect, useRef } from "react";
import { useSelectionStore } from "./useSelectionStore";

/**
 * Chọn ảnh kiểu Google Photos trên store chọn ảnh dùng chung:
 * - `toggleItem(id)`: bấm thường = bật / tắt; giữ Shift = chọn cả dải từ ảnh
 *   bấm trước đó tới ảnh này (theo thứ tự `orderedIds`).
 * - `toggleGroup(ids)`: chọn / bỏ chọn cả 1 nhóm (vd 1 ngày).
 * - Esc thoát chế độ chọn. `resetKey` đổi (vd đổi sắp xếp) → bỏ mốc Shift cũ.
 */
export function useRangeSelection(orderedIds: string[], resetKey?: unknown) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const toggle = useSelectionStore((s) => s.toggle);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clear = useSelectionStore((s) => s.clear);

  // Theo dõi phím Shift (click không mang shiftKey qua onToggle của card).
  const shiftRef = useRef(false);
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
    };
    // Rời tab khi đang giữ Shift → không nhận keyup, tránh kẹt "Shift".
    const onBlur = () => {
      shiftRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const toggleItem = useCallback(
    (id: string) => {
      const index = orderedIds.indexOf(id);
      const last = lastRef.current;
      if (shiftRef.current && last !== null && index !== -1) {
        const [from, to] = index < last ? [index, last] : [last, index];
        selectAll([...new Set([...selectedIds, ...orderedIds.slice(from, to + 1)])]);
      } else {
        toggle(id);
      }
      lastRef.current = index;
    },
    [orderedIds, selectedIds, selectAll, toggle],
  );

  const toggleGroup = useCallback(
    (ids: string[]) => {
      const allSelected = ids.every((id) => selectedIds.has(id));
      const next = new Set(selectedIds);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      if (next.size === 0) clear();
      else selectAll([...next]);
    },
    [selectedIds, selectAll, clear],
  );

  // Esc thoát chế độ chọn.
  useEffect(() => {
    if (!isSelecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSelecting, clear]);

  // Thoát chế độ chọn / đổi thứ tự → mốc Shift cũ không còn đúng vị trí.
  useEffect(() => {
    lastRef.current = null;
  }, [isSelecting, resetKey]);

  return { toggleItem, toggleGroup };
}
