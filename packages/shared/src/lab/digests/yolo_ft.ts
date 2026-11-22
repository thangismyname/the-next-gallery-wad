// yolo_ft: fine-tune YOLO26n (tag theo tập lớp, Δ AP lớp COCO).
import type { LabCell } from "../../types";
import { Obj, arr, num } from "../common";

/** tag[] (model × set) → mỗi hàng = 1 set (coco / gap / objects), cột base / ft (`metric`). */
export function yoloFtTagBySet(result: unknown, metric: string) {
  const tag = arr((result as Obj | undefined)?.tag);
  const sets = [...new Set(tag.map((t) => String(t.set)))];
  return sets.map((set) => ({
    label: set,
    base: num(tag.find((t) => t.model === "base" && t.set === set)?.[metric]),
    ft: num(tag.find((t) => t.model === "ft" && t.set === set)?.[metric]),
  }));
}

/** per_class.csv: Δ AP vẽ khung (ft − base) của lớp COCO → `n` lớp tăng nhiều nhất + `n` lớp giảm nhiều nhất. */
export function yoloFtDetDeltas(rows: Record<string, LabCell>[], n = 8) {
  const deltas = rows
    .filter((r) => r.set === "coco" && num(r.base_det_AP) != null && num(r.ft_det_AP) != null)
    .map((r) => ({ label: String(r.class), delta: (r.ft_det_AP as number) - (r.base_det_AP as number) }))
    .sort((a, b) => b.delta - a.delta);
  return deltas.length <= 2 * n ? deltas : [...deltas.slice(0, n), ...deltas.slice(-n)];
}

// ── select ──
