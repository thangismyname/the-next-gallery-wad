"""E4 — YOLO26 baseline trên Open Images.

  * Map lớp OI → lớp COCO của YOLO (cột `coco` trong oi_classes.csv). Lớp không map
    được → gap_classes.csv (khoảng trống CLIP có thể lấp, đầu vào E5).
  * Detection mAP@0.5 theo lớp trùng, giao thức Open Images: chỉ chấm trên ảnh đã
    xác minh lớp đó (positive/negative), box group-of tính 1 GT (metrics.detection_ap).
  * Detection → tag image-level: điểm ảnh = conf lớn nhất của lớp; có tag khi ≥ τ_t
    (τ_t tối đa F1 trên val). So thêm với ngưỡng mặc định của app (AI_YOLO_CONF 0.25,
    AI_YOLO_MIN_CONF 0.4).

Weights fine-tune trên Open Images (`yolo_ft`, tên lớp = tên OI) cũng chạy được: lớp map theo tên
OI thay vì cột `coco` → `e4 --weights models/yolo26n-oi-<run>.pt --no-latest` (rồi `e5 --e4-ft-run <id>`).

Detection chạy với conf 0.001 (chuẩn khi tính mAP); app chỉ giữ ≥0.25.
Artifacts: yolo_tagger.json, scores.npz (điểm image-level, 0 với lớp không có trong YOLO).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from experiments import metrics as M
from experiments.core import CommonParams, Run, opt
from experiments.features import APP_YOLO, yolo_detections, yolo_names
from experiments.oi_data import OISubset, load_subset

APP_THRESHOLDS = {"app_conf_0.25": 0.25, "app_min_conf_0.4": 0.4}


@dataclass
class E4Params(CommonParams):
    weights: str = opt(APP_YOLO, "Weights YOLO (models/<tên> hoặc tên Ultralytics).")
    conf: float = opt(0.001, "Ngưỡng conf khi detect (thấp để tính mAP).")
    imgsz: int = opt(640, "Kích thước ảnh vào YOLO (= AI_YOLO_IMGSZ).")
    preprocess: str = opt("backend", "Tiền xử lý ảnh.", choices=["backend", "raw"])
    iou: float = opt(0.5, "Ngưỡng IoU khớp box.")
    bootstrap: int = opt(200, "Bootstrap CI cho tag image-level trên test (0 = tắt).")
    workers: int = opt(8, "Luồng đọc ảnh.")


def class_targets(classes: list[dict], model_names: list[str]) -> list[str | None]:
    """Tên lớp của model ứng với từng lớp OI (None = model không có lớp đó).
    Model COCO → cột `coco`; model fine-tune trên OI (tên lớp = tên OI) → chính tên OI."""
    names = set(model_names)
    if any(c["oi_name"] in names for c in classes):
        return [c["oi_name"] if c["oi_name"] in names else None for c in classes]
    return [c.get("coco") or None for c in classes]


def image_scores(subset: OISubset, dets: dict, targets: list[str | None]) -> np.ndarray:
    """(N, C): conf lớn nhất của lớp model tương ứng; 0 nếu không có / lớp không map."""
    S = np.zeros((len(subset.image_ids), len(targets)), dtype=np.float32)
    by_name: dict[str, list[int]] = {}
    for j, t in enumerate(targets):
        if t:
            by_name.setdefault(t, []).append(j)
    for i, img in enumerate(subset.image_ids):
        for d in dets.get(img, []):
            for j in by_name.get(d["class_name"], ()):
                S[i, j] = max(S[i, j], d["confidence"])
    return S


def detection_eval(subset: OISubset, dets: dict, c: int, coco: str, iou: float) -> dict:
    verified = M.known(subset.Y, c)
    det_list, gts = [], {}
    for i in np.flatnonzero(verified):
        img = subset.image_ids[i]
        for d in dets.get(img, []):
            if d["class_name"] == coco:
                det_list.append((int(i), d["confidence"], d["bbox"]))
        boxes = [b for b in subset.boxes.get(img, []) if b[0] == c]
        normal = np.asarray([b[1:5] for b in boxes if not b[5]], dtype=np.float64).reshape(-1, 4)
        group = np.asarray([b[1:5] for b in boxes if b[5]], dtype=np.float64).reshape(-1, 4)
        if len(normal) or len(group):
            gts[int(i)] = (normal, group)
    out = M.detection_ap(det_list, gts, iou_thr=iou)
    out["verified_images"] = int(verified.sum())
    out["group_boxes"] = int(sum(len(g) for _, g in gts.values()))
    return out


def run(p: E4Params) -> dict:
    with Run("e4", p) as run:
        run.stage("load subset")
        val, test = load_subset(p.root, "validation", p.smoke), load_subset(p.root, "test", p.smoke)
        classes = val.classes
        targets = class_targets(classes, yolo_names(p.weights, p.device))
        covered = np.array([t is not None for t in targets])
        is_coco = np.array([bool(c.get("coco")) for c in classes])
        run.log(f"  {p.weights}: {covered.sum()} / {len(classes)} lớp có trong YOLO "
                f"({(covered & is_coco).sum()} lớp COCO · {(covered & ~is_coco).sum()} lớp ngoài COCO)")
        run.table("gap_classes", [{"class": c["oi_name"], "group": c["group"], "old_tag": c.get("old_tag", ""),
                                   "test_pos": int((test.Y[:, j] == 1).sum())}
                                  for j, c in enumerate(classes) if not covered[j]])

        run.stage("YOLO detect")
        dv = yolo_detections(val.name, val.image_ids, val.paths(), p.root, p.weights, p.conf, p.imgsz,
                             p.preprocess, p.device, p.workers, run=run)
        dt = yolo_detections(test.name, test.image_ids, test.paths(), p.root, p.weights, p.conf, p.imgsz,
                             p.preprocess, p.device, p.workers, run=run)

        run.stage("detection mAP@IoU (giao thức OI)")
        det_rows = []
        for split, subset, dets in (("validation", val, dv), ("test", test, dt)):
            for j, c in enumerate(classes):
                if not covered[j] or not c["boxable"]:
                    continue
                r = detection_eval(subset, dets, j, targets[j], p.iou)
                det_rows.append({"split": split, "class": c["oi_name"], "coco": c.get("coco", ""),
                                 "in_coco": bool(is_coco[j]), "group": c["group"], **r})
        run.table("detection_ap", det_rows)

        run.stage("tag image-level")
        Sv, St = image_scores(val, dv, targets), image_scores(test, dt, targets)
        thr = np.full(len(classes), np.inf)
        for j in np.flatnonzero(covered):
            m = M.known(val.Y, j)
            thr[j] = M.tune_threshold(Sv[m, j], val.Y[m, j] == 1)["threshold"]
        cols = list(np.flatnonzero(covered))
        variants = {"tuned_on_val": thr}
        for name, t in APP_THRESHOLDS.items():
            variants[name] = np.where(covered, t, np.inf)
        tag_rows = []
        for name, t in variants.items():
            for gname in ("all", "object", "scene", "coco", "gap"):
                gcols = [j for j in cols if gname == "all" or classes[j]["group"] == gname
                         or (gname == "coco" and is_coco[j]) or (gname == "gap" and not is_coco[j])]
                if gcols:
                    tag_rows.append({"thresholds": name, "group": gname,
                                     **M.multilabel_summary(St, test.Y, t, cols=gcols)})
        run.table("tag_summary", tag_rows)
        ap_test = M.per_class_ap(St, test.Y)
        per_class = []
        for j in cols:
            m = M.known(test.Y, j)
            r = M.prf_at(St[m, j], test.Y[m, j] == 1, thr[j])
            per_class.append({"class": classes[j]["oi_name"], "coco": classes[j].get("coco", ""),
                              "group": classes[j]["group"], "threshold": thr[j], "test_AP": ap_test[j],
                              "test_precision": r["precision"], "test_recall": r["recall"], "test_f1": r["f1"],
                              "test_pos": int((test.Y[:, j] == 1).sum())})
        run.table("tag_per_class", per_class)

        ci = {}
        if p.bootstrap:
            run.stage(f"bootstrap {p.bootstrap}×")
            ci = M.bootstrap_ci(lambda idx: {k: v for k, v in M.multilabel_summary(
                St[idx], test.Y[idx], thr, cols=cols).items() if k in ("mAP", "macro_f1")},
                len(test.image_ids), p.bootstrap)

        run.save_artifact("yolo_tagger.json", {
            "weights": p.weights, "conf": p.conf, "imgsz": p.imgsz, "preprocess": p.preprocess,
            "classes": [c["oi_name"] for c in classes], "covered": covered.tolist(),
            "thresholds": [float(t) if np.isfinite(t) else None for t in thr]})
        run.save_artifact("scores.npz", {"ids_val": np.array(val.image_ids), "ids_test": np.array(test.image_ids),
                                         "S_val": Sv, "S_test": St, "covered": covered})
        test_det = [r for r in det_rows if r["split"] == "test"]
        run.summary = {
            "weights": p.weights,
            "covered_classes": int(covered.sum()), "gap_classes": int((~covered).sum()),
            "test_detection_mAP50": M.nanmean([r["AP"] for r in test_det]),
            "test_detection_mAP50_coco": M.nanmean([r["AP"] for r in test_det if r["in_coco"]]),
            "test_detection_mAP50_noncoco": M.nanmean([r["AP"] for r in test_det if not r["in_coco"]]),
            "test_detection_mAP50_object": M.nanmean([r["AP"] for r in test_det if r["group"] == "object"]),
            "test_tag": [r for r in tag_rows if r["group"] == "all"],
            "test_tag_by_set": [r for r in tag_rows if r["thresholds"] == "tuned_on_val"], "test_tag_ci95": ci,
        }
        run.log(f"  test detection mAP@{p.iou}: {run.summary['test_detection_mAP50']:.4f} · "
                f"tag mAP {tag_rows[0]['mAP']:.4f} · macro-F1 {tag_rows[0]['macro_f1']:.4f}")
    return run.summary
