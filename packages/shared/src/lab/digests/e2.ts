// E2: CLIP zero-shot gắn tag (theo nhóm, reliability, template).
import type { LabCell } from "../../types";
import { Obj, arr, num, Tone } from "../common";

/** groups[]: all / object / scene (main) + 17 tag cũ "tag:<id>" (tags, mAP giảm dần). */
export function e2Groups(result: unknown) {
  const groups = arr((result as Obj | undefined)?.groups);
  const row = (g: Obj, label: string) => ({
    label,
    mAP: num(g.mAP),
    macro_f1: num(g.macro_f1),
    classes: num(g.classes),
  });
  return {
    main: ["all", "object", "scene"]
      .map((id) => groups.find((g) => g.group === id))
      .filter((g): g is Obj => Boolean(g))
      .map((g) => row(g, String(g.group))),
    tags: groups
      .filter((g) => String(g.group).startsWith("tag:"))
      .map((g) => row(g, String(g.group).slice(4)))
      .sort((a, b) => (b.mAP ?? 0) - (a.mAP ?? 0)),
  };
}

/** reliability_test.{raw,calibrated}[] → 1 mảng điểm theo confidence (x) cho 2 đường; bin rỗng bị bỏ. */
export function e2Reliability(result: unknown) {
  const rel = (result as Obj | undefined)?.reliability_test as Obj | undefined;
  const points: { x: number; raw?: number; calibrated?: number }[] = [];
  for (const kind of ["raw", "calibrated"] as const) {
    for (const b of arr(rel?.[kind])) {
      const x = num(b.confidence);
      const y = num(b.accuracy);
      if (x == null || y == null || !num(b.count)) continue;
      points.push({ x, [kind]: y });
    }
  }
  return points.sort((a, b) => a.x - b.x);
}

/** templates.csv: Δ val mAP của từng template so với template đã chọn (result.template). */
export function templateDeltas(rows: Record<string, LabCell>[], chosen: unknown) {
  const ref = num(rows.find((r) => r.template === chosen)?.val_mAP);
  if (ref == null) return [];
  return rows
    .filter((r) => num(r.val_mAP) != null)
    .map((r) => ({
      label: String(r.template),
      delta: (r.val_mAP as number) - ref,
      tone: (r.template === chosen ? "clip" : "muted") as Tone,
    }))
    .sort((a, b) => b.delta - a.delta);
}

// ── E3 ──
