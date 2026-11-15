"""Báo cáo tổng hợp E1–E6 → Results/oi/REPORT.md (vi) / REPORT.en.md (en, cho luận văn).

Mỗi thí nghiệm lấy run chính thức mới nhất (latest.json); cuối báo cáo là bảng lịch sử
(History/<exp>/index.csv) để so các lần đo. Bản báo cáo cũng được lưu vào
History/report/REPORT[.en]_<ngày-giờ>.md.

    uv run python -m experiments report              # tiếng Việt
    uv run python -m experiments report --lang en    # tiếng Anh
"""
from __future__ import annotations

import csv
import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from bench.common import history_dir
from experiments.core import CommonParams, data_fingerprint, find_run, opt, result_root

EXPS = ("e1", "e2", "e3", "e4", "yolo_ft", "e5", "probe", "e6")
_LANG = "vi"


def L(vi: str, en: str) -> str:
    return en if _LANG == "en" else vi


@dataclass
class ReportParams(CommonParams):
    top_classes: int = opt(10, "Số lớp tốt nhất / kém nhất hiện trong bảng theo lớp.")
    lang: str = opt("vi", "Ngôn ngữ báo cáo.", choices=["vi", "en"])


# ── tiện ích ──────────────────────────────────────────────────────────────
def _num(v, digits: int = 3) -> str:
    if v in (None, ""):
        return "–"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return str(v)
    if x != x:  # nan
        return "–"
    return f"{x:.{digits}f}" if not x.is_integer() or digits == 0 else f"{int(x)}"


def _table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def _csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _latest(root: Path, exp: str) -> Path | None:
    try:
        return find_run(root, exp)
    except SystemExit:
        return None


def _meta(run: Path) -> str:
    cfg = json.loads((run / "config.json").read_text())
    env = cfg.get("environment", {})
    return f"run `{run.name}` · {env.get('chip', '?')} · torch {env.get('torch', '?')} · commit `{env.get('git_commit', '?')}`"


def _missing(exp: str) -> str:
    return L(f"_Chưa có run chính thức — chạy `uv run python -m experiments {exp}`._",
             f"_No official run yet — run `uv run python -m experiments {exp}`._")


def _ci(lo, hi) -> str:
    return f"{_num(lo)} … {_num(hi)}"


# ── từng phần ─────────────────────────────────────────────────────────────
def section_e1(run: Path | None) -> str:
    out = [L("## E1 — Sanity check CLIP (Flickr30k 1K, COCO 5K)", "## E1 — CLIP sanity check (Flickr30k 1K, COCO 5K)")]
    if run is None:
        return "\n\n".join(out + [_missing("e1")])
    res = json.loads((run / "result.json").read_text())
    rows = [[r["model"], r["dataset"], r["preprocess"], r["caption_prefix"],
             _num(r["t2i_R@1"], 1), _num(r["t2i_R@5"], 1), _num(r["t2i_R@10"], 1),
             _num(r["i2t_R@1"], 1), _num(r["i2t_R@5"], 1), _num(r["i2t_R@10"], 1),
             f"{_num(r.get('pub_t2i_R@1'), 1)} / {_num(r.get('pub_i2t_R@1'), 1)}",
             f"{_num(r.get('delta_t2i_R@1'), 1)} / {_num(r.get('delta_i2t_R@1'), 1)}",
             {True: "✅", False: "❌"}.get(r.get("pass"), "")] for r in res["rows"]]
    verdict = {True: L("✅ khớp số paper (|Δ R@1| ≤ 2)", "✅ matches the paper (|Δ R@1| ≤ 2)"),
               False: L("❌ lệch số paper ở ít nhất 1 chiều — xem bảng", "❌ deviates from the paper in at least one direction — see table"),
               None: L("chưa có cấu hình nào để đối chiếu", "no configuration comparable to the paper")}[res.get("all_pass")]
    out += [_meta(run), L("**Kết luận:** ", "**Verdict:** ") + verdict,
            _table(["model", "dataset", "preprocess", "prefix", "t2i R@1", "R@5", "R@10",
                    "i2t R@1", "R@5", "R@10", L("paper R@1 (t2i/i2t)", "paper R@1 (t2i/i2t)"), "Δ R@1",
                    L("đạt", "pass")], rows),
            L("R@K tính theo %. Δ chỉ chấm ở cấu hình giống paper (raw + \"a photo of\"); `backend` = ảnh đi qua "
              "pipeline app (WebP ≤512).",
              "R@K in %. Δ is only scored for the paper's setting (raw images + \"a photo of\" caption prefix); "
              "`backend` = images passed through the app pipeline (WebP ≤512 px).")]
    return "\n\n".join(out)


def section_e2(run: Path | None, top: int) -> str:
    out = [L("## E2 — CLIP zero-shot tag (RQ1)", "## E2 — CLIP zero-shot tagging (RQ1)")]
    if run is None:
        return "\n\n".join(out + [_missing("e2")])
    res = json.loads((run / "result.json").read_text())
    tpl = _csv(run / "templates.csv")
    summary = [r for r in _csv(run / "summary.csv") if r["split"] == "test"]
    ci = res.get("test_ci95", {})
    out += [_meta(run),
            L("Template chọn trên val: ", "Prompt template selected on val: ")
            + f"**`{res['template']}`** · test mAP **{_num(res['test']['mAP'])}** "
            f"(CI95 {_num(ci.get('mAP_lo'))}–{_num(ci.get('mAP_hi'))}) · macro-F1 **{_num(res['test']['macro_f1'])}** "
            f"(CI95 {_num(ci.get('macro_f1_lo'))}–{_num(ci.get('macro_f1_hi'))})",
            L("**Chọn template (val):**", "**Template selection (val):**"),
            _table(["template", "val mAP", "object", "scene"],
                   [[f"`{r['template']}`", _num(r["val_mAP"]), _num(r["val_mAP_object"]), _num(r["val_mAP_scene"])]
                    for r in tpl]),
            L("**Test theo nhóm** (ECE trước → sau calibrate isotonic; `tag:` = 17 tag cũ của app):",
              "**Test by group** (ECE before → after isotonic calibration; `tag:` = the app's 17 legacy tags):"),
            _table([L("nhóm", "group"), L("lớp", "classes"), "mAP", "macro-F1", "micro-F1",
                    L("ECE trước", "ECE before"), L("ECE sau", "ECE after")],
                   [[r["group"], r["classes"], _num(r["mAP"]), _num(r["macro_f1"]), _num(r["micro_f1"]),
                     _num(r["ece_raw"]), _num(r["ece_calibrated"])] for r in summary])]
    per = [r for r in _csv(run / "per_class.csv") if r["test_AP"]]
    per.sort(key=lambda r: float(r["test_AP"]))
    cols = [L("lớp", "class"), L("nhóm", "group"), "AP test", "F1 test", L("pos test", "test positives")]
    fmt = lambda r: [r["class"], r["group"], _num(r["test_AP"]), _num(r["test_f1"]), r["test_pos"]]  # noqa: E731
    out += [L(f"**{top} lớp kém nhất / tốt nhất** (đủ bảng: `{run.name}/per_class.csv`):",
              f"**{top} worst / best classes** (full table: `{run.name}/per_class.csv`):"),
            _table(cols, [fmt(r) for r in per[:top]]), _table(cols, [fmt(r) for r in per[-top:][::-1]])]
    return "\n\n".join(out)


def section_e3(run: Path | None) -> str:
    out = [L("## E3 — CLIP zero-shot search (RQ1)", "## E3 — CLIP zero-shot retrieval (RQ1)")]
    if run is None:
        return "\n\n".join(out + [_missing("e3")])
    res = json.loads((run / "result.json").read_text())
    out.append(_meta(run))
    a = res.get("a_class_queries")
    if a:
        rows = []
        for mode, label in (("strict", L("strict (chưa gán = sai)", "strict (unlabelled = irrelevant)")),
                            ("known", L("known-only", "verified-only"))):
            for g in ("all", "object", "scene"):
                m = a[f"{mode}_{g}"]
                rows.append([label, g, m["queries"], _num(m["AP"]), _num(m["P@1"]), _num(m["P@5"]),
                             _num(m["P@10"]), _num(m["P@20"]), _num(m["nDCG@10"])])
        out += [L("**(a) Query theo lớp** — `a photo of a {lớp}`, 5.000 ảnh test:",
                  "**(a) Class-name queries** — `a photo of a {class}`, 5,000 test images:"),
                _table([L("cách tính", "protocol"), L("nhóm", "group"), "query", "mAP", "P@1", "P@5", "P@10",
                        "P@20", "nDCG@10"], rows),
                L("Chênh lệch strict ↔ known-only ≈ phần do nhãn Open Images thiếu — xem tay `a_fp_review.csv`.",
                  "The strict ↔ verified-only gap reflects missing Open Images labels (see `a_fp_review.csv`).")]
    b = res.get("b_captions")
    if b:
        out += [L("**(b) Caption Localized Narratives** (1 ảnh đúng / caption, collection 5.000 ảnh):",
                  "**(b) Localized Narratives captions** (one correct image per caption, 5,000-image collection):"),
                _table(["caption", "query", "R@1", "R@5", "R@10", "MRR", "median rank"],
                       [[v, d["queries"], _num(d["R@1"]), _num(d["R@5"]), _num(d["R@10"]), _num(d["MRR"]),
                         _num(d["median_rank"], 0)] for v, d in b.items()])]
    c = res.get("c_compositional")
    if c:
        rows = [[k, _num(v.get("P@10")), _num(v.get("P@20")), _num(v.get("nDCG@10")),
                 f"{float(v.get('judged_fraction') or 0):.0%}"] for k, v in c.items() if isinstance(v, dict)]
        out += [L("**(c) Query ghép** (chấm tay, pool `Classes/open-images/judgments.csv`):",
                  "**(c) Compositional queries** (manual relevance judgments, pool `Classes/open-images/judgments.csv`):"),
                _table([L("cấu hình", "config"), "P@10", "P@20", "nDCG@10", L("đã chấm", "judged")], rows)]
        if c.get("unjudged_pairs"):
            out.append(L(f"⚠️ còn **{c['unjudged_pairs']}** cặp chưa chấm → số trên chưa dùng được "
                         f"(mở `{run.name}/judge.html`).",
                         f"⚠️ **{c['unjudged_pairs']}** pairs not judged yet → numbers above are not usable "
                         f"(open `{run.name}/judge.html`)."))
    if res.get("d_vietnamese"):
        out += [L("**(d) Tiếng Việt (UIT-OpenViIC)**", "**(d) Vietnamese queries (UIT-OpenViIC)**"),
                _table([L("cấu hình", "config"), "R@1", "R@5", "R@10", "MRR"],
                       [[k, _num(v["R@1"]), _num(v["R@5"]), _num(v["R@10"]), _num(v["MRR"])]
                        for k, v in res["d_vietnamese"].items()])]
    else:
        out.append(L("**(d) Tiếng Việt:** tạm hoãn (chưa có UIT-OpenViIC).",
                     "**(d) Vietnamese queries:** postponed (UIT-OpenViIC not available yet)."))
    return "\n\n".join(out)


def section_e4(run: Path | None, top: int) -> str:
    out = ["## E4 — YOLO26 baseline"]
    if run is None:
        return "\n\n".join(out + [_missing("e4")])
    res = json.loads((run / "result.json").read_text())
    tag = _csv(run / "tag_summary.csv")
    det = [r for r in _csv(run / "detection_ap.csv") if r["split"] == "test" and r["AP"]]
    det.sort(key=lambda r: float(r["AP"]))
    gap = _csv(run / "gap_classes.csv")
    dcols = [L("lớp", "class"), "AP", "GT", L("box group-of", "group-of boxes")]
    out += [_meta(run),
            L(f"Lớp có trong YOLO (COCO): **{res['covered_classes']}** · khoảng trống (chỉ CLIP lấp được): "
              f"**{res['gap_classes']}** · detection mAP@0.5 test (giao thức OI): **{_num(res['test_detection_mAP50'])}**",
              f"Classes covered by YOLO (COCO): **{res['covered_classes']}** · gap (CLIP only): "
              f"**{res['gap_classes']}** · test detection mAP@0.5 (Open Images protocol): "
              f"**{_num(res['test_detection_mAP50'])}**"),
            L("**Tag image-level từ detection** (lớp có trong YOLO; `tuned_on_val` = ngưỡng/lớp chọn trên val, "
              "`app_*` = ngưỡng mặc định của app):",
              "**Image-level tags from detections** (YOLO-covered classes; `tuned_on_val` = per-class threshold "
              "selected on val, `app_*` = the app's default thresholds):"),
            _table([L("ngưỡng", "threshold"), L("nhóm", "group"), L("lớp", "classes"), "mAP", "macro-F1",
                    "micro-F1", "micro-precision"],
                   [[r["thresholds"], r["group"], r["classes"], _num(r["mAP"]), _num(r["macro_f1"]),
                     _num(r["micro_f1"]), _num(r["micro_precision"])] for r in tag]),
            L(f"**Detection AP@0.5 — {top} lớp kém nhất / tốt nhất:**", f"**Detection AP@0.5 — {top} worst / best classes:**"),
            _table(dcols, [[r["class"], _num(r["AP"]), r["n_gt"], r["group_boxes"]] for r in det[:top]]),
            _table(dcols, [[r["class"], _num(r["AP"]), r["n_gt"], r["group_boxes"]] for r in det[-top:][::-1]]),
            L("Lớp YOLO không có (ví dụ): ", "Classes YOLO cannot detect (examples): ")
            + f"{', '.join(r['class'] for r in gap[:20])}{'…' if len(gap) > 20 else ''}"]
    return "\n\n".join(out)


def section_e5(run: Path | None) -> str:
    out = [L("## E5 — Hợp nhất tag YOLO + CLIP (RQ2, C1)", "## E5 — Per-tag YOLO + CLIP fusion (RQ2, C1)")]
    if run is None:
        return "\n\n".join(out + [_missing("e5")])
    res = json.loads((run / "result.json").read_text())
    strat = _csv(run / "strategies.csv")
    names = {"clip_only": L("chỉ CLIP", "CLIP only"), "yolo_only": L("chỉ YOLO", "YOLO only"),
             "or": "OR (max)", "and": "AND (min)",
             "group_baseline": L("vật thể→YOLO, cảnh→CLIP", "objects→YOLO, scenes→CLIP"),
             "per_tag": L("**chọn theo từng tag**", "**per-tag rule**")}
    rows = []
    for s in names:
        by = {r["classes_set"]: r for r in strat if r["strategy"] == s}
        rows.append([names[s]] + [f"{_num(by[k]['macro_f1'])} / {_num(by[k]['mAP'])}" if k in by else "–"
                                  for k in ("all", "yolo_covered", "object", "scene")]
                    + [_num(by.get("all", {}).get("micro_precision"))])
    ci = res.get("paired_ci95", {})
    choice = _csv(run / "rule_choice.csv")
    out += [_meta(run),
            L(f"Precision mục tiêu khi chọn ngưỡng/quy tắc trên val: **{res['precision_target']}**",
              f"Precision target when selecting thresholds/rules on val: **{res['precision_target']}**"),
            L("**Test — macro-F1 / mAP theo tập lớp:**", "**Test — macro-F1 / mAP per class set:**"),
            _table([L("chiến lược", "strategy"), L("tất cả", "all"), L("lớp có YOLO", "YOLO-covered"), "object",
                    "scene", "micro-precision"], rows),
            L("**Cải thiện có ý nghĩa? (CI95 bootstrap ghép cặp, không chứa 0 = có ý nghĩa)**",
              "**Is the gain significant? (paired bootstrap 95% CI; excludes 0 = significant)**"),
            _table([L("so sánh", "comparison"), "CI95 macro-F1", "CI95 mAP"], [
                [L("per_tag − chỉ CLIP (tất cả lớp)", "per_tag − CLIP only (all classes)"),
                 _ci(ci.get("per_tag_minus_clip_macro_f1_lo"), ci.get("per_tag_minus_clip_macro_f1_hi")),
                 _ci(ci.get("per_tag_minus_clip_mAP_lo"), ci.get("per_tag_minus_clip_mAP_hi"))],
                [L("per_tag − chỉ YOLO (lớp có YOLO)", "per_tag − YOLO only (YOLO-covered)"),
                 _ci(ci.get("per_tag_minus_yolo_macro_f1_covered_lo"), ci.get("per_tag_minus_yolo_macro_f1_covered_hi")),
                 _ci(ci.get("per_tag_minus_yolo_mAP_covered_lo"), ci.get("per_tag_minus_yolo_mAP_covered_hi"))]]),
            L("**Nhóm tag nào lấy nguồn nào** (số lớp chọn mỗi quy tắc trên val):",
              "**Which source wins for which tag group** (number of classes choosing each rule on val):"),
            _table([L("nhóm", "group"), L("có YOLO", "YOLO-covered"), L("lớp", "classes"), "clip", "yolo", "or", "and",
                    L("đạt precision", "precision target met")],
                   [[r["group"], r["yolo_covered"], r["classes"], r["clip"], r["yolo"], r["or"], r["and"],
                     r["target_reached"]] for r in choice])]
    return "\n\n".join(out)


def section_yolo_ft(run: Path | None) -> str:
    out = [L("## YOLO-FT — Fine-tune YOLO26n trên box Open Images", "## YOLO-FT — Fine-tuning YOLO26n on Open Images boxes")]
    if run is None:
        return "\n\n".join(out + [_missing("yolo_ft")])
    res = json.loads((run / "result.json").read_text())
    u, d = res.get("ultralytics_test") or {}, res.get("oi_detection_AP50") or {}
    ds = res.get("dataset") or {}
    out += [_meta(run), L(f"Model: `{res.get('weights')}` · {res.get('classes')} lớp vật thể "
                          f"({res.get('coco_classes')} COCO + {res.get('gap_classes')} ngoài COCO) · train "
                          f"{(ds.get('train') or {}).get('images', '?')} ảnh / {(ds.get('train') or {}).get('boxes', '?')} box "
                          f"· {_num((res.get('train_seconds') or 0) / 60, 0)} phút trên {res.get('device')}.",
                          f"Model: `{res.get('weights')}` · {res.get('classes')} object classes "
                          f"({res.get('coco_classes')} COCO + {res.get('gap_classes')} non-COCO) · trained on "
                          f"{(ds.get('train') or {}).get('images', '?')} images / {(ds.get('train') or {}).get('boxes', '?')} "
                          f"boxes · {_num((res.get('train_seconds') or 0) / 60, 0)} min on {res.get('device')}.")]
    if u:
        out.append(_table([L("chỉ số (Ultralytics, test)", "metric (Ultralytics, test)"), L("giá trị", "value")],
                          [["mAP@50", _num(u.get("mAP50"))], ["mAP@50-95", _num(u.get("mAP50_95"))],
                           [L("mAP@50-95 lớp COCO", "mAP@50-95 COCO classes"), _num(u.get("mAP50_95_coco_classes"))],
                           [L("mAP@50-95 lớp ngoài COCO", "mAP@50-95 non-COCO classes"), _num(u.get("mAP50_95_gap_classes"))]]))
    out += [L("**Giao thức Open Images (như E4), test:**", "**Open Images protocol (as in E4), test:**"),
            _table([L("model", "model"), L("tập lớp", "classes"), L("vẽ khung AP@0.5", "detection AP@0.5"),
                    L("tag mAP", "tag mAP"), "tag macro-F1", f"tag macro-F1 @P≥{0.9:g}"],
                   [[t["model"], t["set"], _num(d.get(f"{t['model']}_{t['set']}")) if t["set"] != "objects" else "–",
                     _num(t["mAP"]), _num(t["macro_f1"]), _num(t["macro_f1_at_precision"])] for t in res.get("tag", [])])]
    ci = res.get("paired_ci95") or {}
    if ci:
        out.append(L("Fine-tune − gốc trên lớp COCO (CI95 bootstrap ghép cặp): ",
                     "Fine-tuned − base on COCO classes (paired bootstrap 95% CI): ")
                   + f"tag mAP {_ci(ci.get('ft_minus_base_coco_mAP_lo'), ci.get('ft_minus_base_coco_mAP_hi'))} · "
                   f"F1@P {_ci(ci.get('ft_minus_base_coco_macro_f1_at_precision_lo'), ci.get('ft_minus_base_coco_macro_f1_at_precision_hi'))}")
    lat = res.get("latency") or {}
    if lat:
        out.append(_table(["model", L("ms/ảnh (pipeline app)", "ms/image (app pipeline)"), L("tham số (M)", "params (M)"),
                           L("file (MB)", "file (MB)")],
                          [[k, _num(v["ms_per_image"], 1), _num(v["params_m"], 2), _num(v.get("file_mb"), 1)]
                           for k, v in lat.items()]))
    return "\n\n".join(out)


def section_probe(run: Path | None) -> str:
    out = [L("## Probe — Tag có train (linear probe trên feature app)",
             "## Probe — Trained tagging (linear probes on the app's stored features)")]
    if run is None:
        return "\n\n".join(out + [_missing("probe")])
    res = json.loads((run / "result.json").read_text())
    rows = _csv(run / "summary.csv")
    names = {"zs_clip": L("CLIP zero-shot (E2)", "CLIP zero-shot (E2)"),
             "e5_per_tag": L("quy tắc từng tag (E5)", "per-tag rule (E5)")}
    pt = res.get("precision_target", 0.9)
    out += [_meta(run), L(f"Train **{res.get('train_images')}** ảnh (split train của Open Images). Siêu tham số, "
                          "ngưỡng và calibrator chọn trên val; test 1 lần. Mốc không train đo cùng thủ tục.",
                          f"Trained on **{res.get('train_images')}** Open Images train images. Hyper-parameters, "
                          "thresholds and calibrators selected on val; test reported once. Untrained baselines "
                          "use the same procedure."),
            _table([L("cấu hình", "config"), L("tập lớp", "classes"), L("số lớp", "n"), "mAP", "macro-F1",
                    f"macro-F1 @P≥{pt:g}", "ECE"],
                   [[names.get(r["config"], r["config"]), r["classes_set"], r["classes"], _num(r["mAP"]),
                     _num(r["macro_f1"]), _num(r["macro_f1_at_precision"]), _num(r.get("ece"))]
                    for r in rows if r["classes_set"] in ("all", "yolo_covered", "yolo_gap")]),
            L("**Siêu tham số chọn trên val:**", "**Hyper-parameters selected on val:**"),
            _table(["config", "L2", L("trọng số cặp chưa xác minh", "unverified-pair weight"), "val mAP",
                    L("biên lưới", "grid edge")],
                   [[n, _num(v["l2"], 4), _num(v["unknown_weight"]), _num(v["val_mAP"]),
                     ", ".join(v.get("grid_edge") or []) or "–"] for n, v in (res.get("selected") or {}).items()])]
    ci = res.get("paired_ci95") or {}
    if ci:
        keys = sorted({k[: -len("_mAP_lo")] for k in ci if k.endswith("_mAP_lo")})
        out += [L("**Chênh lệch ghép cặp trên test (CI95 bootstrap, không chứa 0 = có ý nghĩa):**",
                  "**Paired differences on test (bootstrap 95% CI; excluding 0 = significant):**"),
                _table([L("so sánh", "comparison"), "Δ mAP", "Δ macro-F1", f"Δ macro-F1 @P≥{pt:g}"],
                       [[k.replace("_minus_", " − "), _ci(ci.get(f"{k}_mAP_lo"), ci.get(f"{k}_mAP_hi")),
                         _ci(ci.get(f"{k}_macro_f1_lo"), ci.get(f"{k}_macro_f1_hi")),
                         _ci(ci.get(f"{k}_macro_f1_at_precision_lo"), ci.get(f"{k}_macro_f1_at_precision_hi"))]
                        for k in keys])]
    return "\n\n".join(out)


def _pairwise_table(rows: list[dict]) -> str:
    return _table(["a", "b", "a", "b", "Δ", "CI95"],
                  [[f"`{r['a']}`", f"`{r['b']}`", _num(r["a_mean"]), _num(r["b_mean"]), _num(r["diff"]),
                    _ci(r.get("diff_ci_lo"), r.get("diff_ci_hi")) if r.get("diff_ci_lo") is not None else "–"]
                   for r in rows])


def _src(source: str) -> str:
    """Nguồn tag E6; oracle = nhãn thật → đánh dấu là trần, không phải model."""
    return L(f"{source} (trần)", f"{source} (ceiling)") if source == "oracle" else source


def section_e6(run: Path | None) -> str:
    out = [L("## E6 — Search lai tag + CLIP (RQ2)", "## E6 — Hybrid retrieval: tags + CLIP (RQ2)")]
    if run is None:
        return "\n\n".join(out + [_missing("e6")])
    res = json.loads((run / "result.json").read_text())
    cap = _csv(run / "captions.csv")
    out += [_meta(run), L("λ (boost) chọn trên caption val: ", "Boost weight λ selected on val captions: ")
            + str(res.get("lambda")),
            L("**Caption Localized Narratives (test)** — Δ MRR so với CLIP thuần, CI95 bootstrap ghép cặp:",
              "**Localized Narratives captions (test)** — Δ MRR vs. plain CLIP, paired bootstrap 95% CI:"),
            _table([L("cấu hình", "config"), L("nguồn tag", "tag source"), "R@1", "R@5", "R@10", "MRR",
                    L("MRR (query nhắc lớp)", "MRR (queries naming a class)"), "Δ MRR CI95"],
                   [[r["mode"], _src(r["source"]), _num(r["R@1"]), _num(r["R@5"]), _num(r["R@10"]), _num(r["MRR"]),
                     _num(r.get("named_MRR")),
                     _ci(r.get("dMRR_ci_lo"), r.get("dMRR_ci_hi")) if r.get("dMRR_ci_lo") else "–"]
                    for r in cap])]
    if (res.get("captions") or {}).get("pairwise"):
        out += [L("**So sánh ghép cặp giữa cấu hình (caption, Δ MRR = a − b):**",
                  "**Paired comparisons between configurations (captions, Δ MRR = a − b):**"),
                _pairwise_table(res["captions"]["pairwise"])]
    comp = res.get("compositional")
    if comp:
        nq = comp.get("queries", "?")
        out += [L(f"**Query ghép (chấm tay, {nq} query)** — Δ P@10 so với CLIP thuần, CI95 bootstrap theo query:",
                  f"**Compositional queries (manual judgments, {nq} queries)** — Δ P@10 vs. plain CLIP, "
                  "per-query bootstrap 95% CI:"),
                _table([L("cấu hình", "config"), L("nguồn", "source"), "P@10", "P@20", "nDCG@10", "Δ P@10 CI95",
                        L("đã chấm", "judged")],
                       [[r["mode"], _src(r["source"]), _num(r.get("P@10")), _num(r.get("P@20")), _num(r.get("nDCG@10")),
                         _ci(r.get("dP@10_ci_lo"), r.get("dP@10_ci_hi")) if r.get("dP@10_ci_lo") is not None else "–",
                         f"{float(r.get('judged_fraction') or 0):.0%}"] for r in comp["rows"]])]
        if comp.get("pairwise"):
            out += [L("**So sánh ghép cặp (query ghép, Δ P@10 = a − b):**",
                      "**Paired comparisons (compositional, Δ P@10 = a − b):**"), _pairwise_table(comp["pairwise"])]
        if comp.get("unjudged_pairs"):
            out.append(L(f"⚠️ còn **{comp['unjudged_pairs']}** cặp chưa chấm (`{run.name}/judge.html`).",
                         f"⚠️ **{comp['unjudged_pairs']}** pairs not judged yet (`{run.name}/judge.html`)."))
    return "\n\n".join(out)


KEY_METRICS = {
    "e1": ["all_pass"], "e2": ["test.mAP", "test.macro_f1", "test.ece_calibrated"],
    "e3": ["a_class_queries.known_all.AP", "a_class_queries.strict_all.AP", "b_captions.full.MRR"],
    "e4": ["test_detection_mAP50"], "e5": ["test_all_classes.per_tag.macro_f1", "test_all_classes.clip_only.macro_f1"],
    "e6": ["captions.queries"], "probe": ["train_images"], "yolo_ft": ["ultralytics_test.mAP50_95"],
}


def section_history(root: Path) -> str:
    out = [L("## Lịch sử các lần đo (History)", "## Measurement history"),
           L("Mỗi dòng = 1 version trong `History/<exp>/`. `data_fingerprint` đổi = dữ liệu khác → so sánh thận trọng.",
             "Each row is one version in `History/<exp>/`. A different `data_fingerprint` means different data — "
             "compare with care.")]
    for exp in EXPS:
        rows = _csv(history_dir(root, exp) / "index.csv")
        if not rows:
            continue
        keys = [k for k in KEY_METRICS.get(exp, []) if k in rows[0]]
        out += [f"**{exp}**", _table(["version", L("ngày", "date"), L("máy", "machine"), "commit",
                                      L("dữ liệu", "data"), *keys],
                                     [[r["version"], r["archived_at"][:16].replace("T", " "), r.get("chip", ""),
                                       r.get("git_commit", ""), r.get("data_fingerprint", ""),
                                       *[_num(r.get(k)) for k in keys]] for r in rows])]
    return "\n\n".join(out)


def build_report(p: ReportParams) -> Path:
    global _LANG
    _LANG = p.lang
    root = p.root
    runs = {e: _latest(root, e) for e in EXPS}
    head = [
        L("# Báo cáo thực nghiệm AI — The Next Gallery (E1–E6)",
          "# AI experiment report — The Next Gallery (E1–E6)"),
        L(f"Tạo lúc {datetime.now():%Y-%m-%d %H:%M} · dữ liệu `{data_fingerprint(root)}` "
          "(map = mapping lớp, val/tes = số ảnh) · mỗi phần dùng run chính thức mới nhất.",
          f"Generated {datetime.now():%Y-%m-%d %H:%M} · data `{data_fingerprint(root)}` "
          "(map = class-mapping hash, val/tes = number of images) · each section uses the latest official run."),
        L("Dữ liệu: Open Images V7, 174 lớp (128 vật thể, 46 cảnh/khái niệm), val 3.000 ảnh để chọn "
          "prompt/ngưỡng/quy tắc, test 5.000 ảnh báo cáo 1 lần. Nhãn image-level do người xác minh; cặp chưa gán "
          "nhãn bị loại khỏi metric. Model: CLIP ViT-B/32 laion2b (app), YOLO26n, ảnh qua pipeline backend.",
          "Data: Open Images V7, 174 classes (128 objects, 46 scenes/concepts); 3,000 val images for selecting "
          "prompts/thresholds/rules, 5,000 test images reported once. Human-verified image-level labels; unlabelled "
          "(image, class) pairs are masked out. Models: CLIP ViT-B/32 laion2b (the app's), YOLO26n, images passed "
          "through the backend pipeline."),
        L("Chi tiết từng run: `Results/oi/<exp>/<run_id>/` (CSV theo lớp / query, result.json). "
          "Số trong bảng là tỉ lệ 0–1 (riêng E1 là %).",
          "Per-run details: `Results/oi/<exp>/<run_id>/` (per-class / per-query CSVs, result.json). "
          "Numbers are fractions in 0–1 (E1 in %)."),
        _table([L("thí nghiệm", "experiment"), "run"],
               [[e, f"`{r.name}`" if r else L("chưa chạy", "not run")] for e, r in runs.items()]),
    ]
    body = [section_e1(runs["e1"]), section_e2(runs["e2"], p.top_classes), section_e3(runs["e3"]),
            section_e4(runs["e4"], p.top_classes), section_yolo_ft(runs["yolo_ft"]), section_e5(runs["e5"]), section_probe(runs["probe"]), section_e6(runs["e6"]),
            section_history(root)]
    text = "\n\n".join(head + body) + "\n"
    suffix = ".en" if p.lang == "en" else ""
    out = result_root(root) / f"REPORT{suffix}.md"
    out.write_text(text, encoding="utf-8")
    snap = history_dir(root, "report") / f"REPORT{suffix}_{datetime.now():%Y%m%d-%H%M}.md"
    snap.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(out, snap)
    return out


def run(p: ReportParams) -> dict:
    out = build_report(p)
    print(f"→ {out}")
    return {"report": str(out)}
