// Lựa chọn của picker: giữ cả item (không chỉ id) theo thứ tự chọn → nơi gọi
// nhận lại MediaListItem đầy đủ, không phải tải lại.
// max = 1 → chọn ảnh khác thay ảnh cũ; max > 1 → đủ thì không thêm nữa.
import { type MediaListItem } from "@tng/shared";
import { useCallback, useMemo, useState } from "react";

const toMap = (items: MediaListItem[] = []) => new Map(items.map((i) => [i.id, i]));

export function useMediaSelection(max?: number, initial?: MediaListItem[]) {
  const [selected, setSelected] = useState(() => toMap(initial));

  const ids = useMemo(() => new Set(selected.keys()), [selected]);
  const items = useMemo(() => [...selected.values()], [selected]);

  const toggle = useCallback(
    (item: MediaListItem) =>
      setSelected((prev) => {
        if (prev.has(item.id)) {
          const next = new Map(prev);
          next.delete(item.id);
          return next;
        }
        if (max === 1) return toMap([item]);
        if (max !== undefined && prev.size >= max) return prev;
        return new Map(prev).set(item.id, item);
      }),
    [max],
  );

  const toggleMany = useCallback(
    (list: MediaListItem[], select: boolean) =>
      setSelected((prev) => {
        const next = new Map(prev);
        for (const item of list) {
          if (!select) next.delete(item.id);
          else if (max === undefined || next.size < max) next.set(item.id, item);
        }
        return next;
      }),
    [max],
  );

  const reset = useCallback((list?: MediaListItem[]) => setSelected(toMap(list)), []);

  return { ids, items, toggle, toggleMany, reset };
}
