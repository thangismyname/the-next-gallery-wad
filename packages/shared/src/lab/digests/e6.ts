// E6: search lai (Δ so với CLIP thuần, theo mode, so sánh có CI).
import { Obj, arr, num, pick, rowsAt } from "../common";

export function e6Rows(r: unknown) {
  const rows = rowsAt(r, "captions", "rows");
  const clip = rows.find((x) => x.mode === "clip");
  const mrr = (x?: Obj) => (typeof x?.MRR === "number" ? x.MRR : undefined);
  const best = (list: Obj[]) => list.reduce<Obj | undefined>((a, b) => ((mrr(b) ?? -1) > (mrr(a) ?? -1) ? b : a), undefined);
  return {
    rows,
    clip: mrr(clip),
    // boost / boost_prob (lọc cứng luôn kém hơn) — cùng định nghĩa với cột "E6 MRR boost tốt nhất" của SUMMARY
    best: best(rows.filter((x) => String(x.mode).startsWith("boost") && !x.ceiling)),
    oracle: mrr(best(rows.filter((x) => x.ceiling))),
  };
}

/** E6: Δ`metric` so với CLIP thuần theo nguồn tag, ở mode tốt hơn của nguồn đó (boost / boost_prob); oracle = trần. */
export function searchGain(e6: unknown, table: "captions" | "compositional" = "captions", metric = "MRR") {
  const rows = rowsAt(e6, table, "rows");
  const clip = pick(rows.find((x) => x.mode === "clip"), metric);
  if (clip == null) return [];
  const bySource = new Map<string, { label: string; delta: number; ceiling: boolean; mode: string }>();
  for (const r of rows) {
    const v = pick(r, metric);
    if (r.mode === "clip" || r.mode === "filter" || v == null) continue;
    const source = String(r.source);
    const delta = v - clip;
    if (!bySource.has(source) || bySource.get(source)!.delta < delta) {
      bySource.set(source, { label: source, delta, ceiling: Boolean(r.ceiling), mode: String(r.mode) });
    }
  }
  return [...bySource.values()].sort((a, b) => b.delta - a.delta);
}

/** Giá trị `metric` của search CLIP thuần (mode "clip") trong bảng captions / compositional. */
export const e6Clip = (result: unknown, table: "captions" | "compositional", metric: string) =>
  num(arr(((result as Obj | undefined)?.[table] as Obj | undefined)?.rows).find((r) => r.mode === "clip")?.[metric]);

/** Δ`metric` so với CLIP thuần theo mode (filter / boost / boost_prob): tốt nhất trên các nguồn thật (không oracle). */
export function e6ByMode(result: unknown, table: "captions" | "compositional", metric: string) {
  const rows = arr(((result as Obj | undefined)?.[table] as Obj | undefined)?.rows);
  const clip = num(rows.find((r) => r.mode === "clip")?.[metric]);
  if (clip == null) return [];
  const best = new Map<string, number>();
  for (const r of rows) {
    const value = num(r[metric]);
    if (r.mode === "clip" || r.ceiling || value == null) continue;
    const mode = String(r.mode);
    best.set(mode, Math.max(best.get(mode) ?? -Infinity, value - clip));
  }
  return [...best].map(([label, delta]) => ({ label, delta }));
}

/** pairwise[]: a − b với CI bootstrap; `significant` = CI không chứa 0. */
export const e6Pairwise = (result: unknown, table: "captions" | "compositional") =>
  arr(((result as Obj | undefined)?.[table] as Obj | undefined)?.pairwise).map((p) => {
    const lo = num(p.diff_ci_lo);
    const hi = num(p.diff_ci_hi);
    return {
      label: `${p.a} − ${p.b}`,
      a: String(p.a),
      metric: String(p.metric),
      delta: num(p.diff),
      lo,
      hi,
      significant: lo != null && hi != null && (lo > 0 || hi < 0),
    };
  });

// ── probe ──
