// E4: YOLO26 gốc (độ phủ lớp, ngưỡng).
import type { LabCell } from "../../types";
import { Obj, arr, num, pick, Tone } from "../common";

/** Độ phủ lớp: lớp YOLO có (COCO) vs lớp gap theo nhóm (gap_classes.csv: object / scene). */
export function e4Coverage(result: unknown, gapRows: Record<string, LabCell>[]) {
  const covered = pick(result, "covered_classes");
  const byGroup = new Map<string, number>();
  for (const r of gapRows) byGroup.set(String(r.group), (byGroup.get(String(r.group)) ?? 0) + 1);
  return [
    ...(covered != null ? [{ label: "covered", count: covered, tone: "yolo" as Tone }] : []),
    ...[...byGroup].map(([group, count]) => ({ label: `gap_${group}`, count, tone: "muted" as Tone })),
  ];
}

/** test_tag[]: tag image-level của YOLO theo cách đặt ngưỡng (tune trên val / conf mặc định của app). */
export const e4Thresholds = (result: unknown) =>
  arr((result as Obj | undefined)?.test_tag)
    .filter((t) => t.group === "all" || t.group == null)
    .map((t) => ({
      label: String(t.thresholds),
      macro_f1: num(t.macro_f1),
      micro_precision: num(t.micro_precision),
      mAP: num(t.mAP),
    }));

// ── E5 ──
