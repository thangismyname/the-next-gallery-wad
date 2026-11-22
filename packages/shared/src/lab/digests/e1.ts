// E1: CLIP so với Table 13 của paper (Δ R@1, dải ±tolerance) + tác động của pipeline app.
import { pick, rowsAt, Tone } from "../common";

export const e1Paper = (r: unknown) =>
  rowsAt(r, "rows").filter((x) => x.preprocess === "raw" && x.caption_prefix === "a photo of");

export interface E1Check {
  dataset: string;
  dir: "t2i" | "i2t";
  ours?: number;
  paper?: number;
  delta?: number;
  pass?: boolean;
}

const DATASET_NAME: Record<string, string> = { flickr30k: "Flickr30k", mscoco_captions: "MSCOCO" };

export const datasetName = (d: unknown) => DATASET_NAME[String(d)] ?? String(d);

/** 4 phép chấm (dataset × chiều) ở cấu hình giống paper; đạt khi |Δ R@1| ≤ tolerance (config.params.tolerance). */
export function e1Checks(result: unknown, tolerance = 2): E1Check[] {
  return e1Paper(result).flatMap((r) =>
    (["t2i", "i2t"] as const).map((dir) => {
      const ours = pick(r, `${dir}_R@1`);
      const paper = pick(r, `pub_${dir}_R@1`);
      const delta = ours != null && paper != null ? ours - paper : undefined;
      return { dataset: datasetName(r.dataset), dir, ours, paper, delta, pass: delta == null ? undefined : Math.abs(delta) <= tolerance };
    }),
  );
}

/** Recall@1/5/10 đo được vs paper cho 1 dataset (cấu hình giống paper). */
export function e1Recall(result: unknown, dataset: string) {
  const row = e1Paper(result).find((r) => datasetName(r.dataset) === dataset);
  if (!row) return [];
  return (["t2i", "i2t"] as const).flatMap((dir) =>
    [1, 5, 10].map((k) => ({ label: `${dir} R@${k}`, ours: pick(row, `${dir}_R@${k}`), paper: pick(row, `pub_${dir}_R@${k}`) })),
  );
}

export type E1Variant = "noPrefix" | "backend" | "both";

const VARIANT: Record<string, E1Variant> = {
  "raw|none": "noPrefix",
  "backend|a photo of": "backend",
  "backend|none": "both",
};

/** Pipeline app làm R@1 đổi bao nhiêu so với cấu hình paper (raw + "a photo of") của CÙNG dataset × chiều. */
export function e1PipelineDeltas(result: unknown) {
  const rows = rowsAt(result, "rows");
  return e1Paper(result).flatMap((base) =>
    (["t2i", "i2t"] as const).flatMap((dir) => {
      const ref = pick(base, `${dir}_R@1`);
      return rows
        .filter((r) => r.dataset === base.dataset && VARIANT[`${r.preprocess}|${r.caption_prefix}`])
        .map((r) => {
          const v = pick(r, `${dir}_R@1`);
          return {
            dataset: datasetName(base.dataset),
            dir,
            variant: VARIANT[`${r.preprocess}|${r.caption_prefix}`],
            delta: v != null && ref != null ? v - ref : undefined,
          };
        });
    }),
  );
}

/** Ngưỡng đạt của E1 (config.json → params.tolerance), mặc định 2 điểm như README. */
export const e1Tolerance = (config: unknown) => {
  const v = (config as { params?: { tolerance?: unknown } } | null | undefined)?.params?.tolerance;
  return typeof v === "number" ? v : 2;
};

/** Cột Δ R@1 vs paper cho DeltaBars: trong dải ±tolerance = màu CLIP, ngoài = FAIL_COLOR. */
export const e1DeltaRows = (result: unknown, tolerance: number) =>
  e1Checks(result, tolerance).map((c) => ({
    label: `${c.dataset} ${c.dir}`,
    delta: c.delta,
    tone: (c.pass === false ? "fail" : "clip") as Tone,
  }));

export const e1Datasets = (result: unknown) => [...new Set(e1Paper(result).map((r) => datasetName(r.dataset)))];
