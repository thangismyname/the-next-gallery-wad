"""export_tags — probe 174 nhãn Open Images cho APP → app/tagging/probes/oi-<config>.npz.

Vì sao không xuất thẳng probe của run `probe`: run đó chọn siêu tham số theo mAP trên
cặp ĐÃ XÁC MINH, và chọn unknown_weight = 0 (bỏ cặp chưa xác minh). Open Images chỉ
xác minh nhãn "có khả năng" → probe gần như không thấy negative và trên ảnh bất kỳ
đoán dương tràn lan (đo trên test: ~26 nhãn / ảnh, "Remote control" ở 96% ảnh) —
thước đo trên cặp đã xác minh không thấy điều này. App gặp ảnh bất kỳ nên cần giả
định THẾ GIỚI MỞ: cặp chưa xác minh = negative (nhiễu — có ít positive bị bỏ sót,
nên precision báo cáo là cận dưới / bảo thủ).

Thủ tục (feature CLIP đã cache bởi `probe`, không encode lại):
  1. train probe trên split train với unknown_weight (mặc định 1 = negative thường),
     chọn L2 theo mAP thế giới mở trên val;
  2. ngưỡng / lớp trên val (thế giới mở): F1 lớn nhất trong các ngưỡng đạt precision ≥
     target, không đạt → không gắn nhãn đó (ngưỡng 1.0); calibrator isotonic trên val;
  3. báo cáo test theo cả 2 giao thức (đã xác minh = so được với `probe`, thế giới mở)
     + số nhãn trung bình / ảnh.

    uv run python -m experiments export_tags
    uv run python -m experiments export_tags --unknown-weight 0.3 --precision-target 0.8
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from experiments import metrics as M
from experiments.core import CommonParams, opt
from experiments.features import APP_CLIP, clip_image_features, parse_clip
from experiments.oi_data import load_subset
from experiments.probe import standardize, train_probe

APP_PROBES_DIR = Path(__file__).resolve().parent.parent / "app" / "tagging" / "probes"
MODE_SIGMOID, MODE_CLASS, MODE_GLOBAL = 0, 1, 2


@dataclass
class ExportTagsParams(CommonParams):
    config: str = opt("lp_clip", "Cấu hình (app chỉ có vector CLIP).", choices=["lp_clip"])
    clip: str = opt(APP_CLIP, "CLIP của app (= AI_CLIP_MODEL:AI_CLIP_PRETRAINED).")
    preprocess: str = opt("backend", "Tiền xử lý ảnh (= backend: ≤512px WebP).", choices=["backend", "raw"])
    unknown_weight: float = opt(1.0, "Trọng số cặp chưa xác minh (nhãn 0). 0 = bỏ → đoán dương tràn lan.")
    l2: list[float] = opt([0.0003, 0.001, 0.003, 0.01, 0.03], "Lưới L2 (chọn theo mAP thế giới mở trên val).")
    max_iter: int = opt(300, "Số vòng L-BFGS.")
    precision_target: float = opt(0.9, "Precision tối thiểu (val, thế giới mở) để gắn 1 nhãn.")
    out_dir: str = opt(str(APP_PROBES_DIR), "Thư mục probe của app.")
    batch_size: int = opt(64, "Batch encode nếu cache CLIP còn thiếu.")


def open_world(Y: np.ndarray) -> np.ndarray:
    """Cặp chưa xác minh (−1) → negative."""
    return np.where(Y == 1, 1, 0).astype(np.int8)


def pack_calibrators(cals: dict, n: int) -> dict:
    """Calibrator (dict lồng) → mảng phẳng cho .npz (không pickle)."""
    mode, shift = np.zeros(n, np.int8), np.zeros(n, np.float32)
    xs, ys, ptr = [], [], [0]
    for c, cal in enumerate(cals["per_class"]):
        if cal["mode"] == "class":
            mode[c] = MODE_CLASS
            xs += cal["x"]
            ys += cal["y"]
        elif cal["mode"] == "global" and cals["global"] is not None:
            mode[c], shift[c] = MODE_GLOBAL, cals["offsets"][c]
        ptr.append(len(xs))
    g = cals["global"] or {"x": [0.0], "y": [0.0]}
    return {"cal_mode": mode, "cal_shift": shift, "cal_x": np.asarray(xs, np.float32),
            "cal_y": np.asarray(ys, np.float32), "cal_ptr": np.asarray(ptr, np.int64),
            "global_x": np.asarray(g["x"], np.float32), "global_y": np.asarray(g["y"], np.float32)}


def report(P: np.ndarray, Y: np.ndarray, thr: np.ndarray) -> dict:
    """Trên test: mAP 2 giao thức + precision / số nhãn mỗi ảnh tại ngưỡng của app."""
    Yo = open_world(Y)
    pred = P >= thr
    verified = Y != -1
    tp_v, fp_v = int((pred & (Y == 1)).sum()), int((pred & (Y == 0)).sum())
    tp_o, fp_o = int((pred & (Yo == 1)).sum()), int((pred & (Yo == 0)).sum())
    return {
        "mAP_verified": M.nanmean(M.per_class_ap(P, Y)),
        "mAP_open_world": M.nanmean(M.per_class_ap(P, Yo)),
        "precision_verified": tp_v / max(1, tp_v + fp_v),
        "precision_open_world": tp_o / max(1, tp_o + fp_o),
        "recall_open_world": tp_o / max(1, int(Yo.sum())),
        "labels_per_image": float(pred.sum(1).mean()),
        "labels_per_image_median": float(np.median(pred.sum(1))),
        "share_on_unverified": float((pred & ~verified).sum() / max(1, pred.sum())),
    }


def run(p: ExportTagsParams) -> dict:
    from app.tagging.labels import calibrate, label_catalog  # cùng code với lúc app chạy

    splits = {s: load_subset(p.root, s, p.smoke) for s in ("train", "validation", "test")}
    classes = [c["oi_name"] for c in splits["validation"].classes]
    if classes != [r["oi_name"] for r in label_catalog()]:
        raise SystemExit("Lớp của subset khác app/tagging/labels.csv — sửa labels.csv cho khớp oi_classes.csv.")
    X = {s: clip_image_features(sub.name, sub.image_ids, sub.paths(), p.root, p.clip, p.preprocess,
                                p.device, p.batch_size) for s, sub in splits.items()}
    Ytr, Yv, Yt = (splits[s].Y for s in ("train", "validation", "test"))
    Yv_o = open_world(Yv)
    mean, std, (Xtr, Xv, Xt) = standardize(X["train"], X["validation"], X["test"])

    best = None
    for l2 in p.l2:
        pr = train_probe(Xtr, Ytr, l2, p.unknown_weight, p.max_iter)
        v = M.nanmean(M.per_class_ap(Xv @ pr["W"] + pr["b"], Yv_o))
        print(f"  l2 {l2:g} · unknown_weight {p.unknown_weight:g} → val mAP (thế giới mở) {v:.4f}", flush=True)
        if best is None or v > best[0]:
            best = (v, l2, pr)
    val_map, l2, pr = best
    Sv, St = Xv @ pr["W"] + pr["b"], Xt @ pr["W"] + pr["b"]

    C = len(classes)
    strict, free = np.full(C, np.inf), np.full(C, np.inf)
    for c in range(C):
        strict[c] = M.tune_threshold(Sv[:, c], Yv_o[:, c] == 1, p.precision_target)["threshold"]
        if not M.tune_threshold(Sv[:, c], Yv_o[:, c] == 1, p.precision_target)["reached"]:
            strict[c] = np.inf
        free[c] = M.tune_threshold(Sv[:, c], Yv_o[:, c] == 1)["threshold"]
    packed = pack_calibrators(M.fit_calibrators(Sv, Yv_o, free, 10), C)

    # Ngưỡng của app ở thang XÁC SUẤT đã calibrate (UI kéo slider theo %); lớp không
    # đạt precision target → 1.0 (không tự gắn, vẫn xem được khi kéo slider xuống).
    finite = np.isfinite(strict)
    thr = calibrate(np.where(finite, strict, 0.0)[None, :].astype(np.float32), packed)[0]
    thr = np.where(finite, np.clip(thr, 0.05, 1.0), 1.0).astype(np.float32)

    test = report(calibrate(St.astype(np.float32), packed), Yt, thr)
    clip_model, clip_pretrained = parse_clip(p.clip)
    meta = {
        "kind": "oi_probe", "config": p.config, "features": ["clip"], "classes": classes,
        "clip_model": clip_model, "clip_pretrained": clip_pretrained, "preprocess": p.preprocess,
        "protocol": "open_world", "unknown_weight": p.unknown_weight, "l2": l2,
        "precision_target": p.precision_target, "val_mAP_open_world": val_map,
        "active_classes": int(finite.sum()), "train_images": len(splits["train"].image_ids),
        "smoke": bool(p.smoke), "test": test,
    }
    out = Path(p.out_dir) / f"oi-{p.config}{'-smoke' if p.smoke else ''}.npz"
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez(out, meta=json.dumps(meta), W=pr["W"], b=pr["b"], mean=mean.astype(np.float32),
             std=std.astype(np.float32), thresholds=thr, **packed)
    print(f"→ {out} ({out.stat().st_size / 1024:.0f} KB) · l2 {l2:g} · {meta['active_classes']}/{C} lớp đạt "
          f"precision ≥ {p.precision_target:g} (val, thế giới mở)")
    print(f"  test: mAP {test['mAP_verified']:.3f} (đã xác minh) / {test['mAP_open_world']:.3f} (thế giới mở) · "
          f"precision {test['precision_verified']:.3f} / {test['precision_open_world']:.3f} · "
          f"{test['labels_per_image']:.1f} nhãn/ảnh (trung vị {test['labels_per_image_median']:.0f})")
    return meta
