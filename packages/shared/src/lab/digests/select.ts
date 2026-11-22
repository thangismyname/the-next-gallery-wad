// select: ảnh được chọn theo split (gộp nhiều run).
import { Obj, num } from "../common";

export interface SelectSplit {
  split: string;
  runId: string;
  candidates?: number;
  selected?: number;
  rotated?: number;
  minPos?: number;
  medianPos?: number;
  p10Pos?: number;
  short: string[];
}

/** Như buildSplits: mỗi run select chọn vài split → lấy split từ run mới nhất có nó. `runs` mới nhất trước. */
export function selectSplits(runs: [string, unknown][]): SelectSplit[] {
  const seen = new Map<string, SelectSplit>();
  for (const [runId, result] of runs) {
    const splits = ((result as Obj | undefined)?.splits ?? {}) as Obj;
    for (const [split, raw] of Object.entries(splits)) {
      if (seen.has(split)) continue;
      const s = (raw ?? {}) as Obj;
      seen.set(split, {
        split,
        runId,
        candidates: num(s.candidates),
        selected: num(s.selected),
        rotated: num(s.excluded_rotated),
        minPos: num(s.min_pos),
        medianPos: num(s.median_pos),
        p10Pos: num(s.p10_pos),
        short: Array.isArray(s.classes_below_half_min_pos) ? (s.classes_below_half_min_pos as string[]) : [],
      });
    }
  }
  const order = ["train", "validation", "test"];
  const rank = (s: string) => order.indexOf(s) + 1 || 99;
  return [...seen.values()].sort((a, b) => rank(a.split) - rank(b.split));
}
