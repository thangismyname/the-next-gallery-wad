// probe: tag có train (bậc thang, CI ghép cặp, theo tập lớp, siêu tham số).
import { Obj, arr, num, pick } from "../common";

export const TRAINED = ["lp_dino", "lp_clip", "lp_clip_dino", "fused_learned"];

/** Probe: không train → có train, cùng thủ tục ngưỡng/calibrate (so trực tiếp được). */
export const tagLadder = (probe: unknown) =>
  ["zs_clip", "e5_per_tag", ...TRAINED]
    .map((c) => ({
      label: c,
      f1p: pick(probe, `test_all_classes.${c}.macro_f1_at_precision`),
      mAP: pick(probe, `test_all_classes.${c}.mAP`),
    }))
    .filter((x) => x.mAP != null || x.f1p != null);

/** paired_ci95 "<a>_minus_<b>_<metric>_lo/hi" → các bậc so sánh của `metric`, Δ tính từ test_all_classes. */
export function probeSteps(result: unknown, metric: string) {
  const ci = ((result as Obj | undefined)?.paired_ci95 ?? {}) as Obj;
  const suffix = `_${metric}_lo`;
  return Object.keys(ci)
    .filter((key) => key.endsWith(suffix) && key.includes("_minus_"))
    .map((key) => {
      const [a, b] = key.slice(0, -suffix.length).split("_minus_");
      const lo = num(ci[key]);
      const hi = num(ci[`${a}_minus_${b}_${metric}_hi`]);
      const va = pick(result, `test_all_classes.${a}.${metric}`);
      const vb = pick(result, `test_all_classes.${b}.${metric}`);
      return {
        label: `${a} − ${b}`,
        a,
        delta: va != null && vb != null ? va - vb : undefined,
        lo,
        hi,
        significant: lo != null && hi != null && (lo > 0 || hi < 0),
      };
    });
}

/** groups[] (config × classes_set) → mỗi hàng = 1 tập lớp, mỗi cột = 1 config (`metric`). */
export function probeBySet(result: unknown, configs: string[], metric: string) {
  const groups = arr((result as Obj | undefined)?.groups);
  const sets = [...new Set(groups.map((g) => String(g.classes_set)))];
  return sets.map((set) => ({
    label: set,
    ...Object.fromEntries(
      configs.map((c) => [c, num(groups.find((g) => g.config === c && g.classes_set === set)?.[metric])]),
    ),
  })) as ({ label: string } & Record<string, number | undefined>)[];
}

/** selected: siêu tham số chọn trên val; grid_edge khác rỗng = rơi vào biên lưới (nên mở rộng lưới). */
export const probeSelected = (result: unknown) =>
  Object.entries(((result as Obj | undefined)?.selected ?? {}) as Obj).map(([config, v]) => {
    const s = (v ?? {}) as Obj;
    return {
      config,
      l2: num(s.l2),
      unknownWeight: num(s.unknown_weight),
      valMAP: num(s.val_mAP),
      gridEdge: Array.isArray(s.grid_edge) ? (s.grid_edge as string[]) : [],
    };
  });

// ── yolo_ft ──
