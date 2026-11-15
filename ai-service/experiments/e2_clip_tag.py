"""E2 — CLIP zero-shot tag trên Open Images (multi-label, nhãn có mask).

Quy trình (mọi lựa chọn trên val, test chạy 1 lần):
  1. Thử từng template prompt (+ ensemble = trung bình mọi template) → chọn theo val mAP.
  2. Điểm (ảnh, lớp) = cos(embedding ảnh, embedding prompt). Không argmax: mỗi lớp
     một ngưỡng tối đa F1 trên val.
  3. Calibrate điểm → xác suất bằng isotonic trên val (lớp ít mẫu: 1 isotonic chung trên
     score − ngưỡng). "Trước calibrate" = xác suất zero-shot kiểu app:
     σ(logit_scale · (cos(lớp) − cos("a photo."))).
  4. Test: mAP, macro/micro-F1 @ngưỡng, ECE trước/sau, CI bootstrap; theo nhóm object/scene
     và theo tag cũ.

Artifacts cho E3/E5/E6: clip_tagger.json (template, ngưỡng, calibrator), scores.npz.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from experiments import metrics as M
from experiments.core import CommonParams, Run, opt
from experiments.features import APP_CLIP, clip_image_features, generic_embedding, logit_scale, prompt_embeddings
from experiments.oi_data import load_subset

DEFAULT_TEMPLATES = [
    "a photo of a {}.",
    "a photo of the {}.",
    "a photo containing a {}.",
    "a close-up photo of a {}.",
    "a picture of a {}.",
    "there is a {} in the photo.",
    "{}",
]


@dataclass
class E2Params(CommonParams):
    clip: str = opt(APP_CLIP, "CLIP MODEL:PRETRAINED.")
    preprocess: str = opt("backend", "Tiền xử lý ảnh.", choices=["backend", "raw"])
    templates: list[str] = opt(DEFAULT_TEMPLATES, "Template ứng viên, {} = tên lớp.")
    ensemble: bool = opt(True, "Thêm ứng viên 'ensemble' (trung bình mọi template).")
    calib_min_count: int = opt(10, "Lớp có ≥ N pos và N neg trên val → isotonic riêng.")
    bootstrap: int = opt(200, "Số mẫu bootstrap cho CI 95% trên test (0 = tắt).")
    batch_size: int = opt(64, "Batch encode ảnh.")


def class_words(classes: list[dict]) -> list[str]:
    return [c.get("prompt") or c["oi_name"].lower() for c in classes]


def group_rows(name: str, S, Y, thr, P_raw, P_cal, classes) -> list[dict]:
    """Bảng tổng: tất cả · object · scene · từng tag cũ."""
    groups = [("all", list(range(len(classes)))),
              ("object", [j for j, c in enumerate(classes) if c["group"] == "object"]),
              ("scene", [j for j, c in enumerate(classes) if c["group"] == "scene"])]
    for tag in sorted({c.get("old_tag") for c in classes if c.get("old_tag")}):
        groups.append((f"tag:{tag}", [j for j, c in enumerate(classes) if c.get("old_tag") == tag]))
    rows = []
    for gname, cols in groups:
        if not cols:
            continue
        s = M.multilabel_summary(S, Y, thr, P_cal, cols)
        rows.append({"split": name, "group": gname, **s,
                     "ece_raw": M.masked_ece(P_raw, Y, cols), "ece_calibrated": s.pop("ece", None)})
    return rows


def run(p: E2Params) -> dict:
    with Run("e2", p) as run:
        run.stage("load subset")
        val, test = load_subset(p.root, "validation", p.smoke), load_subset(p.root, "test", p.smoke)
        classes, words = val.classes, class_words(val.classes)
        run.log(f"  val {len(val.image_ids)} ảnh · test {len(test.image_ids)} ảnh · {len(classes)} lớp")

        run.stage("CLIP image features")
        Xv = clip_image_features(val.name, val.image_ids, val.paths(), p.root, p.clip, p.preprocess,
                                 p.device, p.batch_size, run=run)
        Xt = clip_image_features(test.name, test.image_ids, test.paths(), p.root, p.clip, p.preprocess,
                                 p.device, p.batch_size, run=run)

        run.stage("chọn template trên val")
        candidates = [(t, [t]) for t in p.templates]
        if p.ensemble and len(p.templates) > 1:
            candidates.append(("ensemble", list(p.templates)))
        obj, scn = val.group_cols("object"), val.group_cols("scene")
        template_rows, best = [], None
        for label, tpls in candidates:
            W = prompt_embeddings(p.clip, words, tpls, p.device)
            ap = M.per_class_ap(Xv @ W.T, val.Y)
            row = {"template": label, "val_mAP": M.nanmean(ap), "val_mAP_object": M.nanmean(ap[obj]),
                   "val_mAP_scene": M.nanmean(ap[scn])}
            template_rows.append(row)
            run.log(f"  {label!r}: val mAP {row['val_mAP']:.4f}")
            if best is None or row["val_mAP"] > best[0]["val_mAP"]:
                best = (row, tpls, W)
        best_row, best_tpls, W = best
        run.log(f"  → chọn {best_row['template']!r}")
        run.table("templates", template_rows)

        run.stage("ngưỡng + calibration trên val")
        Sv, St = Xv @ W.T, Xt @ W.T
        g = generic_embedding(p.clip, p.device)
        scale = logit_scale(p.clip, p.device)
        Pv_raw = M.sigmoid(scale * (Sv - (Xv @ g)[:, None]))
        Pt_raw = M.sigmoid(scale * (St - (Xt @ g)[:, None]))
        tuned = []
        for c in range(len(classes)):
            m = M.known(val.Y, c)
            tuned.append(M.tune_threshold(Sv[m, c], val.Y[m, c] == 1))
        thr = np.array([t["threshold"] for t in tuned])
        cals = M.fit_calibrators(Sv, val.Y, thr, p.calib_min_count)
        Pv, Pt = M.apply_calibrators(Sv, cals), M.apply_calibrators(St, cals)

        run.stage("đánh giá test")
        summary_rows = group_rows("validation", Sv, val.Y, thr, Pv_raw, Pv, classes) + \
            group_rows("test", St, test.Y, thr, Pt_raw, Pt, classes)
        run.table("summary", summary_rows)
        ap_test = M.per_class_ap(St, test.Y)
        per_class = []
        for c, cls in enumerate(classes):
            mt = M.known(test.Y, c)
            r = M.prf_at(St[mt, c], test.Y[mt, c] == 1, thr[c])
            per_class.append({
                "class": cls["oi_name"], "group": cls["group"], "coco": cls.get("coco", ""),
                "old_tag": cls.get("old_tag", ""),
                "val_pos": int((val.Y[:, c] == 1).sum()), "val_neg": int((val.Y[:, c] == 0).sum()),
                "test_pos": int((test.Y[:, c] == 1).sum()), "test_neg": int((test.Y[:, c] == 0).sum()),
                "val_f1": tuned[c]["f1"], "threshold": thr[c], "test_AP": ap_test[c],
                "test_precision": r["precision"], "test_recall": r["recall"], "test_f1": r["f1"],
                "test_ece_raw": M.ece(Pt_raw[mt, c], test.Y[mt, c] == 1),
                "test_ece_cal": M.ece(Pt[mt, c], test.Y[mt, c] == 1),
                "calibration": cals["per_class"][c]["mode"],
            })
        run.table("per_class", per_class)

        ci = {}
        if p.bootstrap:
            run.stage(f"bootstrap {p.bootstrap}×")
            ci = M.bootstrap_ci(lambda idx: {k: v for k, v in M.multilabel_summary(
                St[idx], test.Y[idx], thr).items() if k in ("mAP", "macro_f1")}, len(test.image_ids), p.bootstrap)

        def known_pairs(P, Y):
            mask = Y != -1
            return P[mask], Y[mask] == 1

        run.save_artifact("clip_tagger.json", {
            "clip": p.clip, "preprocess": p.preprocess, "template": best_row["template"],
            "templates": best_tpls, "classes": [c["oi_name"] for c in classes],
            "thresholds": thr.tolist(), "thresholds_prob": [
                float(M.apply_calibrators(np.full((1, len(classes)), thr), cals)[0, c])
                if np.isfinite(thr[c]) else None for c in range(len(classes))],
            "calibrators": cals, "logit_scale": scale,
        })
        run.save_artifact("scores.npz", {"ids_val": np.array(val.image_ids), "ids_test": np.array(test.image_ids),
                                         "S_val": Sv, "S_test": St, "P_val": Pv, "P_test": Pt,
                                         "Praw_val": Pv_raw, "Praw_test": Pt_raw})
        test_all = next(r for r in summary_rows if r["split"] == "test" and r["group"] == "all")
        run.summary = {
            "template": best_row["template"], "test": test_all, "test_ci95": ci,
            "groups": [r for r in summary_rows if r["split"] == "test"],
            "reliability_test": {"raw": M.reliability_bins(*known_pairs(Pt_raw, test.Y)),
                                 "calibrated": M.reliability_bins(*known_pairs(Pt, test.Y))},
        }
        run.log(f"  test: mAP {test_all['mAP']:.4f} · macro-F1 {test_all['macro_f1']:.4f} · "
                f"ECE {test_all['ece_raw']:.4f} → {test_all['ece_calibrated']:.4f}")
    return run.summary
