// Tab Tổng quan: chỉ số chính lấy từ result.json run mới nhất của từng experiment + nhóm theo 4 bước luận văn.
import { Obj, pick } from "./common";
import { e1Paper } from "./digests/e1";
import { e6Rows } from "./digests/e6";
import { TRAINED } from "./digests/probe";

export type Results = Partial<Record<string, unknown>>;

export interface Kpi {
  /** = exp; i18n lab.overview.kpi.<id>.{title,sub} */
  id: string;
  value?: number;
  /** Tham số cho câu phụ (đã làm tròn ở component). */
  params: Record<string, number | string | undefined>;
  pass?: boolean;
  /** Cột trong History/summary/index.csv (do experiments/summary.py đặt tên) → sparkline. */
  spark?: string;
}

export function buildKpis(res: Results): Kpi[] {
  const flickr = e1Paper(res.e1).find((x) => x.dataset === "flickr30k");
  const ours = typeof flickr?.["t2i_R@1"] === "number" ? flickr["t2i_R@1"] : undefined;
  const paper = typeof flickr?.["pub_t2i_R@1"] === "number" ? flickr["pub_t2i_R@1"] : undefined;
  const allPass = (res.e1 as Obj | undefined)?.all_pass;

  const bestProbe = TRAINED.map((c) => ({ c, v: pick(res.probe, `test_all_classes.${c}.mAP`) }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v! - a.v!)[0];
  const zs = pick(res.probe, "test_all_classes.zs_clip.mAP");

  const perTag = pick(res.e5, "test_all_classes.per_tag.macro_f1");
  const clipOnly = pick(res.e5, "test_all_classes.clip_only.macro_f1");

  const e6 = e6Rows(res.e6);
  const e6Best = typeof e6.best?.MRR === "number" ? e6.best.MRR : undefined;
  const gap =
    e6Best != null && e6.clip != null && e6.oracle != null && e6.oracle > e6.clip
      ? ((e6Best - e6.clip) / (e6.oracle - e6.clip)) * 100
      : undefined;

  const covered = pick(res.e4, "covered_classes");
  const gapClasses = pick(res.e4, "gap_classes");
  const sub = (a?: number, b?: number) => (a != null && b != null ? a - b : undefined);

  return [
    {
      id: "e1",
      value: ours,
      params: { paper, delta: sub(ours, paper) },
      pass: typeof allPass === "boolean" ? allPass : undefined,
      spark: "E1 Flickr câu→ảnh R@1 (%)",
    },
    {
      id: "e2",
      value: pick(res.e2, "test.mAP"),
      params: {
        lo: pick(res.e2, "test_ci95.mAP_lo"),
        hi: pick(res.e2, "test_ci95.mAP_hi"),
        ece: pick(res.e2, "test.ece_calibrated"),
      },
      spark: "E2 tag CLIP mAP",
    },
    {
      id: "e3",
      value: pick(res.e3, "a_class_queries.known_all.P@10"),
      params: {
        en: pick(res.e3, "c_compositional.en@app.P@10"),
        vi: pick(res.e3, "c_compositional.vi@app.P@10"),
        multi: pick(res.e3, "c_compositional.vi@multilingual.P@10"),
      },
      spark: "E3a tìm theo tên lớp mAP",
    },
    {
      id: "e4",
      value: pick(res.e4, "test_detection_mAP50"),
      params: { covered, total: covered != null && gapClasses != null ? covered + gapClasses : undefined },
      spark: "E4 YOLO vẽ khung mAP@0.5",
    },
    {
      id: "yolo_ft",
      value: pick(res.yolo_ft, "oi_detection_AP50.ft_gap"),
      params: {
        n: pick(res.yolo_ft, "gap_classes"),
        base: pick(res.yolo_ft, "oi_detection_AP50.base_coco"),
        ft: pick(res.yolo_ft, "oi_detection_AP50.ft_coco"),
      },
      spark: "YOLO-FT test mAP@50-95",
    },
    {
      id: "e5",
      value: perTag,
      params: {
        clip: clipOnly,
        delta: sub(perTag, clipOnly),
        lo: pick(res.e5, "paired_ci95.per_tag_minus_clip_macro_f1_lo"),
        hi: pick(res.e5, "paired_ci95.per_tag_minus_clip_macro_f1_hi"),
      },
      spark: "E5 macro-F1 gộp theo tag",
    },
    {
      id: "probe",
      value: bestProbe?.v,
      params: { config: bestProbe?.c, delta: sub(bestProbe?.v, zs) },
      spark: bestProbe ? `Probe mAP ${bestProbe.c}` : undefined,
    },
    {
      id: "e6",
      value: e6Best,
      params: {
        clip: e6.clip,
        oracle: e6.oracle,
        gap,
        config: e6.best ? `${e6.best.mode}:${e6.best.source}` : undefined,
      },
      spark: "E6 MRR boost tốt nhất",
    },
  ];
}

// ── Dữ liệu chart ──

/** 4 bước của luận văn: thẻ + chart của từng bước (thứ tự hiển thị). */
export const OVERVIEW_GROUPS = [
  { id: "baseline", kpis: ["e1", "e4"], charts: ["paper"] },
  { id: "rq1", kpis: ["e2", "e3"], charts: [] },
  { id: "improve", kpis: ["e5", "probe", "yolo_ft"], charts: ["fusion", "ladder"] },
  { id: "rq2", kpis: ["e6"], charts: ["search"] },
] as const;
