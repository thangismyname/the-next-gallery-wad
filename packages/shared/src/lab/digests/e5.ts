// E5: gộp YOLO + CLIP theo tag.
import type { LabCell } from "../../types";
import { Obj, arr, num, pick } from "../common";

export const E5_STRATEGIES = ["yolo_only", "clip_only", "and", "group_baseline", "or", "per_tag"];

/** E5: macro-F1 (precision ≥ target) của từng chiến lược trên mọi lớp. */
export const fusionStrategies = (e5: unknown) =>
  E5_STRATEGIES.map((s) => ({ label: s, value: pick(e5, `test_all_classes.${s}.macro_f1`) })).filter(
    (x) => x.value != null,
  );

// ── Nhóm + màu ──

/** test_all_classes: macro-F1 + mAP của từng chiến lược (không _ft). */
export const e5Strategies = (result: unknown) =>
  E5_STRATEGIES.map((s) => ({
    label: s,
    macro_f1: pick(result, `test_all_classes.${s}.macro_f1`),
    mAP: pick(result, `test_all_classes.${s}.mAP`),
  })).filter((r) => r.macro_f1 != null);

/** strategies.csv → mỗi hàng = 1 tập lớp (all, coco, non_coco…), mỗi cột = 1 chiến lược (`metric`). */
export function e5BySet(rows: Record<string, LabCell>[], strategies: string[], metric = "macro_f1") {
  const sets = [...new Set(rows.map((r) => String(r.classes_set)))];
  return sets.map((set) => ({
    label: set,
    ...Object.fromEntries(
      strategies.map((s) => [s, num(rows.find((r) => r.strategy === s && r.classes_set === set)?.[metric])]),
    ),
  })) as ({ label: string } & Record<string, number | undefined>)[];
}

/** rule_choice[] (hoặc rule_choice_ft): số tag mỗi nhóm chọn quy tắc clip / yolo / or / and. */
export const e5RuleChoice = (result: unknown, key = "rule_choice") =>
  arr((result as Obj | undefined)?.[key]).map((r) => ({
    label: `${r.group}${r.group === "object" ? (r.yolo_covered ? "·coco" : "·non_coco") : ""}`,
    clip: num(r.clip) ?? 0,
    yolo: num(r.yolo) ?? 0,
    or: num(r.or) ?? 0,
    and: num(r.and) ?? 0,
    classes: num(r.classes),
    reached: num(r.target_reached),
  }));

/** Thay YOLO gốc bằng YOLO fine-tune: Δ macro-F1 (<strategy>_ft − <strategy>) trên mọi lớp. */
export const e5FtDeltas = (result: unknown) =>
  E5_STRATEGIES.filter((s) => s !== "clip_only")
    .map((s) => {
      const base = pick(result, `test_all_classes.${s}.macro_f1`);
      const ft = pick(result, `test_all_classes.${s}_ft.macro_f1`);
      return { label: s, delta: base != null && ft != null ? ft - base : undefined };
    })
    .filter((r) => r.delta != null);

// ── E6 ──
