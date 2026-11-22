import { describe, expect, it } from "vitest";
import { apHistogram, e2Groups, e2Reliability, e3Captions, e3Compositional, e3PrecisionCurve, e4Coverage, e4Thresholds, e5BySet, e5FtDeltas, e5RuleChoice, e6ByMode, e6Pairwise, probeSteps, selectSplits, templateDeltas, worstClasses, yoloFtDetDeltas } from "@tng/shared/lab";

describe("E2", () => {
  it("e2Groups: main theo thứ tự all/object/scene, tag bỏ tiền tố và xếp mAP giảm dần", () => {
    const g = e2Groups({
      groups: [
        { group: "scene", mAP: 0.9 },
        { group: "tag:pets", mAP: 0.97 },
        { group: "all", mAP: 0.88 },
        { group: "tag:food", mAP: 0.89 },
      ],
    });
    expect(g.main.map((r) => r.label)).toEqual(["all", "scene"]);
    expect(g.tags.map((r) => r.label)).toEqual(["pets", "food"]);
  });

  it("e2Reliability: gộp raw + calibrated theo x, bỏ bin rỗng", () => {
    const p = e2Reliability({
      reliability_test: {
        raw: [{ confidence: 0.5, accuracy: 0.6, count: 3 }, { confidence: 0.9, accuracy: 0.9, count: 0 }],
        calibrated: [{ confidence: 0.1, accuracy: 0.1, count: 5 }],
      },
    });
    expect(p).toEqual([{ x: 0.1, calibrated: 0.1 }, { x: 0.5, raw: 0.6 }]);
  });

  it("apHistogram: AP = 1 vào bin cao nhất, bin cao → thấp; worstClasses tăng dần", () => {
    const rows = [{ class: "a", test_AP: 1 }, { class: "b", test_AP: 0.05 }, { class: "c", test_AP: null }, { class: "d", test_AP: 0.95 }];
    const h = apHistogram(rows, "test_AP", 10);
    expect(h[0]).toEqual({ label: "0.9–1.0", count: 2 });
    expect(h[9]).toEqual({ label: "0.0–0.1", count: 1 });
    expect(worstClasses(rows, "test_AP", 2).map((r) => r.label)).toEqual(["b", "d"]);
  });

  it("templateDeltas: Δ so với template đã chọn; không tìm thấy template → rỗng", () => {
    const rows = [{ template: "a {}", val_mAP: 0.87 }, { template: "b {}", val_mAP: 0.88 }];
    const d = templateDeltas(rows, "b {}");
    expect(d.map((x) => x.label)).toEqual(["b {}", "a {}"]);
    expect(d[1].delta).toBeCloseTo(-0.01);
    expect(templateDeltas(rows, "x")).toEqual([]);
  });
});

describe("E3", () => {
  const r = {
    a_class_queries: { strict_all: { "P@1": 0.96, "P@10": 0.88 }, known_all: { "P@1": 0.99 } },
    b_captions: { full: { "R@1": 0.25, MRR: 0.36 }, first_sentence: { "R@1": 0.18 } },
    c_compositional: { "en@app": { "P@10": 0.53 }, "vi@multilingual": { "P@10": 0.52 }, unjudged_pairs: 0 },
  };
  it("đường P@k, caption, query ghép (bỏ key không phải object)", () => {
    expect(e3PrecisionCurve(r).map((x) => [x.label, x.strict, x.known])).toEqual([
      ["P@1", 0.96, 0.99],
      ["P@10", 0.88, undefined],
    ]);
    expect(e3Captions(r).map((x) => x.label)).toEqual(["R@1", "MRR"]);
    expect(e3Compositional(r).map((x) => [x.lang, x.model, x.p10])).toEqual([
      ["en", "app", 0.53],
      ["vi", "multilingual", 0.52],
    ]);
  });
});

describe("E4 / E5", () => {
  it("e4Coverage: covered + gap theo nhóm; e4Thresholds chỉ lấy group all", () => {
    const c = e4Coverage({ covered_classes: 81 }, [{ group: "object" }, { group: "scene" }, { group: "object" }]);
    expect(c.map((x) => [x.label, x.count])).toEqual([["covered", 81], ["gap_object", 2], ["gap_scene", 1]]);
    const t = e4Thresholds({ test_tag: [{ thresholds: "tuned_on_val", group: "all", macro_f1: 0.83 }, { thresholds: "x", group: "object" }] });
    expect(t.map((x) => x.label)).toEqual(["tuned_on_val"]);
  });

  it("e5BySet / e5RuleChoice / e5FtDeltas", () => {
    const rows = [
      { strategy: "clip_only", classes_set: "all", macro_f1: 0.69 },
      { strategy: "per_tag", classes_set: "all", macro_f1: 0.76 },
      { strategy: "per_tag", classes_set: "scene", macro_f1: 0.8 },
    ];
    expect(e5BySet(rows, ["clip_only", "per_tag"])).toEqual([
      { label: "all", clip_only: 0.69, per_tag: 0.76 },
      { label: "scene", clip_only: undefined, per_tag: 0.8 },
    ]);
    const rc = e5RuleChoice({ rule_choice: [{ group: "object", yolo_covered: true, clip: 19, yolo: 16, or: 34, and: 12 }, { group: "scene", clip: 46 }] });
    expect(rc.map((x) => [x.label, x.or])).toEqual([["object·coco", 34], ["scene", 0]]);
    const d = e5FtDeltas({ test_all_classes: { per_tag: { macro_f1: 0.76 }, per_tag_ft: { macro_f1: 0.78 }, or: { macro_f1: 0.7 } } });
    expect(d).toHaveLength(1);
    expect(d[0].delta).toBeCloseTo(0.02);
  });
});

describe("E6 / probe / yolo_ft / select", () => {
  it("e6ByMode bỏ oracle; e6Pairwise significant khi CI không chứa 0", () => {
    const r = {
      captions: {
        rows: [
          { mode: "clip", MRR: 0.36 },
          { mode: "filter", source: "yolo", MRR: 0.34 },
          { mode: "boost", source: "yolo", MRR: 0.37 },
          { mode: "boost", source: "oracle", ceiling: true, MRR: 0.4 },
        ],
        pairwise: [
          { a: "x", b: "y", metric: "MRR", diff: 0.01, diff_ci_lo: 0.003, diff_ci_hi: 0.02 },
          { a: "p", b: "q", metric: "MRR", diff: 0, diff_ci_lo: -0.004, diff_ci_hi: 0.004 },
        ],
      },
    };
    const m = e6ByMode(r, "captions", "MRR");
    expect(m.map((x) => x.label)).toEqual(["filter", "boost"]);
    expect(m[0].delta).toBeCloseTo(-0.02);
    expect(m[1].delta).toBeCloseTo(0.01);
    expect(e6Pairwise(r, "captions").map((x) => x.significant)).toEqual([true, false]);
  });

  it("probeSteps tách a/b từ key, Δ từ test_all_classes", () => {
    const r = {
      test_all_classes: { lp_clip: { mAP: 0.94 }, zs_clip: { mAP: 0.88 } },
      paired_ci95: { lp_clip_minus_zs_clip_mAP_lo: 0.05, lp_clip_minus_zs_clip_mAP_hi: 0.06, lp_clip_minus_zs_clip_macro_f1_lo: 0.04 },
    };
    const s = probeSteps(r, "mAP");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ label: "lp_clip − zs_clip", a: "lp_clip", significant: true });
    expect(s[0].delta).toBeCloseTo(0.06);
  });

  it("yoloFtDetDeltas chỉ lớp coco, lấy 2 đầu khi dài; selectSplits lấy split mới nhất", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ class: `c${i}`, set: "coco", base_det_AP: 0.5, ft_det_AP: 0.5 + (i - 10) / 100 }));
    rows.push({ class: "g", set: "gap", base_det_AP: 0, ft_det_AP: 0.9 });
    const d = yoloFtDetDeltas(rows, 2);
    expect(d.map((x) => x.label)).toEqual(["c19", "c18", "c1", "c0"]);
    const s = selectSplits([["new", { splits: { train: { selected: 15000 } } }], ["old", { splits: { train: { selected: 1 }, test: { selected: 5000 } } }]]);
    expect(s.map((x) => [x.split, x.selected])).toEqual([["train", 15000], ["test", 5000]]);
  });
});
