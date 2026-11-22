import { describe, expect, it } from "vitest";
import { buildKpis, buildSplits, PIPELINE, pipelineOrder, e1Checks, e1PipelineDeltas, e1Recall, fmt, fusionStrategies, pick, searchGain, sourceKind, tagLadder } from "@tng/shared/lab";

const e6 = {
  captions: {
    rows: [
      { mode: "clip", source: "-", ceiling: false, MRR: 0.36 },
      { mode: "filter", source: "yolo", ceiling: false, MRR: 0.4 }, // filter bị bỏ khỏi chart
      { mode: "boost", source: "yolo", ceiling: false, MRR: 0.37 },
      { mode: "boost_prob", source: "yolo", ceiling: false, MRR: 0.372 },
      { mode: "boost", source: "oracle", ceiling: true, MRR: 0.38 },
    ],
  },
};

describe("overview", () => {
  it("pick: path lồng, không phải số → undefined", () => {
    expect(pick({ a: { "P@10": 0.5 } }, "a.P@10")).toBe(0.5);
    expect(pick({ a: "x" }, "a.b")).toBeUndefined();
  });

  it("KPI E6: best không tính trần, % khoảng cách tới oracle", () => {
    const k = buildKpis({ e6 }).find((x) => x.id === "e6")!;
    // filter (0.40) không tính — chỉ boost / boost_prob
    expect(k.value).toBe(0.372);
    expect(k.params.config).toBe("boost_prob:yolo");
    expect(k.params.gap).toBeCloseTo(60);
  });

  it("thiếu run → value undefined, không lỗi", () => {
    const kpis = buildKpis({});
    expect(kpis).toHaveLength(8);
    expect(kpis.every((k) => k.value === undefined)).toBe(true);
  });

  it("searchGain: mode tốt nhất mỗi nguồn, oracle đánh dấu trần", () => {
    const g = searchGain(e6);
    expect(g.map((x) => x.label)).toEqual(["oracle", "yolo"]);
    expect(g[1].delta).toBeCloseTo(0.012);
    expect(g[0].ceiling).toBe(true);
  });

  it("ladder / strategies / paper giữ thứ tự cố định, bỏ mục thiếu", () => {
    const probe = { test_all_classes: { lp_clip: { mAP: 0.94 }, zs_clip: { mAP: 0.88, macro_f1_at_precision: 0.7 } } };
    expect(tagLadder(probe).map((x) => x.label)).toEqual(["zs_clip", "lp_clip"]);
    expect(fusionStrategies({ test_all_classes: { per_tag: { macro_f1: 0.76 } } })).toEqual([{ label: "per_tag", value: 0.76 }]);
  });
});

describe("sourceKind", () => {
  it("gộp được ưu tiên trước yolo / dino", () => {
    expect(["fused_learned_ft", "e5_per_tag", "lp_clip_dino", "or", "group_baseline"].map(sourceKind)).toEqual(
      Array(5).fill("fusion"),
    );
    expect(["yolo_ft", "yolo_only", "lp_dino", "lp_clip", "zs_clip", "clip_only", "oracle"].map(sourceKind)).toEqual([
      "yolo", "yolo", "dino", "clip", "clip", "clip", "reference",
    ]);
  });
});

describe("build / e1", () => {
  it("buildSplits: split lấy từ run mới nhất có nó, % tính đúng, thứ tự train → val → test", () => {
    const splits = buildSplits([
      ["new", { splits: { train: { images: 10, images_with_boxes: 5, known_pairs: 4, positive_pairs: 1 } } }],
      ["old", { splits: { test: { images: 4, missing: 1, broken: 1 }, train: { images: 999 } } }],
    ]);
    expect(splits.map((s) => [s.split, s.runId, s.images])).toEqual([["train", "new", 10], ["test", "old", 4]]);
    expect(splits[0].boxesPct).toBe(50);
    expect(splits[0].positiveRate).toBe(25);
    expect(splits[1].problems).toBe(2);
    expect(splits[1].captionsPct).toBe(0);
  });

  it("e1Checks: đạt theo |Δ| ≤ tolerance từng chiều", () => {
    const r = { rows: [{ dataset: "flickr30k", preprocess: "raw", caption_prefix: "a photo of", "t2i_R@1": 65, "pub_t2i_R@1": 68.7, "i2t_R@1": 88.3, "pub_i2t_R@1": 88, "t2i_R@5": 88 }] };
    const c = e1Checks(r, 2);
    expect(c.map((x) => [x.dataset, x.dir, x.pass])).toEqual([["Flickr30k", "t2i", false], ["Flickr30k", "i2t", true]]);
    expect(e1Checks(r, 4)[0].pass).toBe(true);
    expect(e1Recall(r, "Flickr30k")[1]).toEqual({ label: "t2i R@5", ours: 88, paper: undefined });
  });

  it("fmt", () => {
    expect(fmt("delta", 0.0123)).toBe("+0.012");
    expect(fmt("pct", 94.1)).toBe("94");
    expect(fmt("value", 65.16)).toBe("65.2");
  });
});

describe("e1PipelineDeltas", () => {
  it("Δ so với cấu hình paper của cùng dataset × chiều; cấu hình paper không tự so với chính nó", () => {
    const base = { dataset: "flickr30k", caption_prefix: "a photo of" };
    const r = {
      rows: [
        { ...base, preprocess: "raw", "t2i_R@1": 65, "i2t_R@1": 88 },
        { ...base, preprocess: "backend", "t2i_R@1": 64.5, "i2t_R@1": 86.6 },
        { dataset: "flickr30k", preprocess: "raw", caption_prefix: "none", "t2i_R@1": 65.5 },
        { dataset: "mscoco_captions", preprocess: "backend", caption_prefix: "none", "t2i_R@1": 1 }, // không có cấu hình paper → bỏ
      ],
    };
    const d = e1PipelineDeltas(r);
    expect(d.map((x) => [x.dir, x.variant])).toEqual([["t2i", "backend"], ["t2i", "noPrefix"], ["i2t", "backend"], ["i2t", "noPrefix"]]);
    expect(d[0].delta).toBeCloseTo(-0.5);
    expect(d[3].delta).toBeUndefined();
  });
});

describe("pipelineOrder", () => {
  it("follows the README run order, unknown experiments last", () => {
    expect(pipelineOrder(["e6", "x_new", "build", "e1", "e4", "yolo_ft"])).toEqual(["build", "e1", "e4", "yolo_ft", "e6", "x_new"]);
    // every dependency runs earlier in the pipeline
    const pos = new Map(PIPELINE.map((p, i) => [p.id, i]));
    for (const p of PIPELINE) for (const n of p.needs) expect(pos.get(n)!).toBeLessThan(pos.get(p.id)!);
  });
});
