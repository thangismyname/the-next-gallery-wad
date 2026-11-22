// build: sức khoẻ dữ liệu + độ phủ annotation theo split (gộp nhiều run).
import { pick } from "../common";

export const SPLIT_ORDER = ["train", "validation", "test"];

export interface SplitStats {
  split: string;
  runId: string;
  images: number;
  /** ảnh thiếu + hỏng + bị loại vì EXIF xoay */
  problems: number;
  missing: number;
  broken: number;
  rotated: number;
  knownPairs: number;
  positivePairs: number;
  /** % positive trong các cặp (ảnh, lớp) đã xác minh */
  positiveRate: number;
  boxesPct: number;
  captionsPct: number;
  groupOfBoxes: number;
}

/** Mỗi run build chỉ dựng vài split (vd train chạy sau val/test) → lấy split từ run mới nhất có nó.
 *  `runs` = [runId, result] mới nhất trước. */
export function buildSplits(runs: [string, unknown][]): SplitStats[] {
  const seen = new Map<string, SplitStats>();
  for (const [runId, result] of runs) {
    const splits = (result as { splits?: Record<string, unknown> } | undefined)?.splits ?? {};
    for (const [split, raw] of Object.entries(splits)) {
      if (seen.has(split)) continue;
      const n = (k: string) => pick(raw, k) ?? 0;
      const images = n("images");
      const known = n("known_pairs");
      const pct = (v: number, of: number) => (of ? (v / of) * 100 : 0);
      seen.set(split, {
        split,
        runId,
        images,
        missing: n("missing"),
        broken: n("broken"),
        rotated: n("exif_rotated_excluded"),
        problems: n("missing") + n("broken") + n("exif_rotated_excluded"),
        knownPairs: known,
        positivePairs: n("positive_pairs"),
        positiveRate: pct(n("positive_pairs"), known),
        boxesPct: pct(n("images_with_boxes"), images),
        captionsPct: pct(n("images_with_captions"), images),
        groupOfBoxes: n("group_of_boxes"),
      });
    }
  }
  const rank = (s: string) => (SPLIT_ORDER.indexOf(s) + 1 || 99);
  return [...seen.values()].sort((a, b) => rank(a.split) - rank(b.split));
}

// ── e1: CLIP vs paper ──
