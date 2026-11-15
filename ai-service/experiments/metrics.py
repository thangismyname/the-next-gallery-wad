"""Metric dùng chung cho E2–E6 (thuần numpy, có unit test).

Quy ước nhãn Open Images: Y[i, c] ∈ {1 = positive đã xác minh, 0 = negative đã
xác minh, -1 = chưa gán (không biết)}. Mọi metric tag chỉ tính trên cặp đã xác
minh (mask), nên precision đo được là cận dưới khi nhãn còn thiếu.
"""
from __future__ import annotations

import numpy as np

UNKNOWN = -1
ECE_BINS = 15


# ── Phân loại nhị phân / multi-label (có mask) ────────────────────────────
def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))


def average_precision(scores: np.ndarray, positive: np.ndarray) -> float:
    """AP không nội suy (= sklearn average_precision_score khi không có điểm trùng)."""
    positive = np.asarray(positive, dtype=bool)
    n_pos = int(positive.sum())
    if n_pos == 0:
        return float("nan")
    order = np.argsort(-np.asarray(scores, dtype=np.float64), kind="mergesort")
    hits = positive[order]
    precision = np.cumsum(hits) / np.arange(1, len(hits) + 1)
    return float((precision * hits).sum() / n_pos)


def known(Y: np.ndarray, c: int) -> np.ndarray:
    return Y[:, c] != UNKNOWN


def tune_threshold(scores: np.ndarray, positive: np.ndarray,
                   precision_target: float | None = None) -> dict:
    """Ngưỡng (dự đoán dương khi score ≥ thr) tối đa F1; có precision_target thì
    tối đa F1 trong các ngưỡng đạt precision ≥ target (không đạt → max F1, reached=False)."""
    scores = np.asarray(scores, dtype=np.float64)
    positive = np.asarray(positive, dtype=bool)
    n_pos = int(positive.sum())
    if n_pos == 0 or len(scores) == 0:
        return {"threshold": float("inf"), "f1": float("nan"), "precision": float("nan"),
                "recall": float("nan"), "reached": False}
    order = np.argsort(-scores, kind="mergesort")
    s, hits = scores[order], positive[order]
    tp = np.cumsum(hits)
    k = np.arange(1, len(s) + 1)
    last_of_tie = np.r_[s[1:] != s[:-1], True]  # chỉ cắt ở cuối nhóm điểm bằng nhau
    tp, k, s_cut = tp[last_of_tie], k[last_of_tie], s[last_of_tie]
    precision, recall = tp / k, tp / n_pos
    f1 = 2 * tp / (k + n_pos)
    reached = True
    candidates = np.arange(len(f1))
    if precision_target is not None:
        ok = precision >= precision_target
        if ok.any():
            candidates = candidates[ok]
        else:
            reached = False
    best = candidates[np.argmax(f1[candidates])]
    return {"threshold": float(s_cut[best]), "f1": float(f1[best]),
            "precision": float(precision[best]), "recall": float(recall[best]), "reached": reached}


def prf_at(scores: np.ndarray, positive: np.ndarray, threshold: float) -> dict:
    pred = np.asarray(scores) >= threshold
    positive = np.asarray(positive, dtype=bool)
    tp = int((pred & positive).sum())
    fp = int((pred & ~positive).sum())
    fn = int((~pred & positive).sum())
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": tp / (tp + fp) if tp + fp else float("nan"),
            "recall": tp / (tp + fn) if tp + fn else float("nan"),
            "f1": 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else float("nan")}


def ece(probs: np.ndarray, correct: np.ndarray, bins: int = ECE_BINS) -> float:
    """Expected Calibration Error (0–1) của xác suất nhị phân."""
    probs = np.asarray(probs, dtype=np.float64).ravel()
    correct = np.asarray(correct, dtype=np.float64).ravel()
    if len(probs) == 0:
        return float("nan")
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(probs, edges[1:-1], right=True), 0, bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            total += m.mean() * abs(probs[m].mean() - correct[m].mean())
    return float(total)


def reliability_bins(probs: np.ndarray, correct: np.ndarray, bins: int = ECE_BINS) -> list[dict]:
    """Dữ liệu reliability diagram (vẽ ở report / UI)."""
    probs = np.asarray(probs, dtype=np.float64).ravel()
    correct = np.asarray(correct, dtype=np.float64).ravel()
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(probs, edges[1:-1], right=True), 0, bins - 1)
    out = []
    for b in range(bins):
        m = idx == b
        out.append({"lo": edges[b], "hi": edges[b + 1], "count": int(m.sum()),
                    "confidence": float(probs[m].mean()) if m.any() else float("nan"),
                    "accuracy": float(correct[m].mean()) if m.any() else float("nan")})
    return out


def masked_ece(P: np.ndarray, Y: np.ndarray, cols=None) -> float:
    cols = range(Y.shape[1]) if cols is None else cols
    probs, correct = [], []
    for c in cols:
        m = known(Y, c)
        probs.append(P[m, c])
        correct.append(Y[m, c] == 1)
    if not probs:
        return float("nan")
    return ece(np.concatenate(probs), np.concatenate(correct))


def per_class_ap(S: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """AP từng lớp trên cặp đã xác minh (lớp thiếu pos hoặc neg → nan)."""
    out = np.full(Y.shape[1], np.nan)
    for c in range(Y.shape[1]):
        m = known(Y, c)
        y = Y[m, c] == 1
        if y.any() and (~y).any():
            out[c] = average_precision(S[m, c], y)
    return out


def nanmean(values) -> float:
    values = np.asarray(values, dtype=np.float64)
    values = values[~np.isnan(values)]
    return float(values.mean()) if len(values) else float("nan")


def multilabel_summary(S: np.ndarray, Y: np.ndarray, thresholds: np.ndarray,
                       P: np.ndarray | None = None, cols=None) -> dict:
    """mAP, macro-F1, micro-F1 (+ ECE nếu có xác suất P) trên tập lớp `cols`."""
    cols = list(range(Y.shape[1])) if cols is None else list(cols)
    aps, f1s, tp, fp, fn = [], [], 0, 0, 0
    for c in cols:
        m = known(Y, c)
        y = Y[m, c] == 1
        if not (y.any() and (~y).any()):
            continue
        aps.append(average_precision(S[m, c], y))
        r = prf_at(S[m, c], y, thresholds[c])
        f1s.append(r["f1"])
        tp, fp, fn = tp + r["tp"], fp + r["fp"], fn + r["fn"]
    out = {"classes": len(aps), "mAP": nanmean(aps), "macro_f1": nanmean(f1s),
           "micro_f1": 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else float("nan"),
           "micro_precision": tp / (tp + fp) if tp + fp else float("nan")}
    if P is not None:
        out["ece"] = masked_ece(P, Y, cols)
    return out


# ── Calibration (isotonic, lưu dạng mảng để app / UI dùng lại) ────────────
def fit_isotonic(scores: np.ndarray, positive: np.ndarray) -> dict:
    from sklearn.isotonic import IsotonicRegression

    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(np.asarray(scores, dtype=np.float64), np.asarray(positive, dtype=np.float64))
    return {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()}


def apply_isotonic(scores: np.ndarray, cal: dict) -> np.ndarray:
    return np.interp(scores, np.asarray(cal["x"]), np.asarray(cal["y"]))


def fit_calibrators(S: np.ndarray, Y: np.ndarray, offsets: np.ndarray, min_count: int = 10) -> dict:
    """Isotonic theo từng lớp khi lớp có ≥min_count pos và neg; lớp ít mẫu dùng 1
    calibrator chung trên điểm đã trừ ngưỡng của lớp (score − thr_c)."""
    per_class, pooled_s, pooled_y = [], [], []
    for c in range(Y.shape[1]):
        m = known(Y, c)
        y = Y[m, c] == 1
        finite = np.isfinite(offsets[c])
        if finite:
            pooled_s.append(S[m, c] - offsets[c])
            pooled_y.append(y)
        if y.sum() >= min_count and (~y).sum() >= min_count:
            per_class.append({"mode": "class", **fit_isotonic(S[m, c], y)})
        else:
            per_class.append({"mode": "global" if finite else "zero"})
    shared = fit_isotonic(np.concatenate(pooled_s), np.concatenate(pooled_y)) if pooled_s else None
    return {"per_class": per_class, "global": shared,
            "offsets": [float(o) if np.isfinite(o) else None for o in offsets]}


def apply_calibrators(S: np.ndarray, cals: dict) -> np.ndarray:
    P = np.zeros_like(S, dtype=np.float64)
    for c, cal in enumerate(cals["per_class"]):
        if cal["mode"] == "class":
            P[:, c] = apply_isotonic(S[:, c], cal)
        elif cal["mode"] == "global" and cals["global"] is not None:
            P[:, c] = apply_isotonic(S[:, c] - cals["offsets"][c], cals["global"])
    return P


# ── Retrieval ─────────────────────────────────────────────────────────────
def ranking_metrics(scores: np.ndarray, relevant: np.ndarray, ks=(1, 5, 10, 20)) -> dict:
    """1 query: P@K, R@K, AP, nDCG@10 (nhị phân), RR trên toàn bộ collection."""
    relevant = np.asarray(relevant, dtype=bool)
    n_rel = int(relevant.sum())
    order = np.argsort(-np.asarray(scores, dtype=np.float64), kind="mergesort")
    rel = relevant[order]
    out = {}
    for k in ks:
        out[f"P@{k}"] = float(rel[:k].mean()) if len(rel) else float("nan")
        out[f"R@{k}"] = float(rel[:k].sum() / n_rel) if n_rel else float("nan")
    out["AP"] = average_precision(scores, relevant)
    out["nDCG@10"] = ndcg(rel, 10, n_rel)
    hits = np.flatnonzero(rel)
    out["RR"] = float(1.0 / (hits[0] + 1)) if len(hits) else 0.0
    return out


def ndcg(rel_in_rank_order: np.ndarray, k: int, n_rel: int, gains=None) -> float:
    rel = np.asarray(rel_in_rank_order[:k], dtype=np.float64) if gains is None else np.asarray(gains[:k])
    discounts = 1.0 / np.log2(np.arange(2, len(rel) + 2))
    dcg = float((rel * discounts).sum())
    ideal = 1.0 / np.log2(np.arange(2, min(k, n_rel) + 2))
    idcg = float(ideal.sum()) if n_rel else 0.0
    return dcg / idcg if idcg else float("nan")


def target_ranks(Q: np.ndarray, X: np.ndarray, target: np.ndarray, chunk: int = 512,
                 extra: np.ndarray | None = None) -> np.ndarray:
    """Hạng (1 = đầu) của ảnh đúng cho mỗi query (1 ảnh đúng / query).
    `extra` (n_query, n_img) cộng thêm vào cosine (dùng cho boost ở E6)."""
    ranks = np.empty(len(Q), dtype=np.int64)
    for start in range(0, len(Q), chunk):
        S = Q[start:start + chunk] @ X.T
        if extra is not None:
            S = S + extra[start:start + chunk]
        t = target[start:start + chunk]
        s_t = S[np.arange(len(S)), t][:, None]
        ranks[start:start + chunk] = 1 + (S > s_t).sum(axis=1)
    return ranks


def recall_from_ranks(ranks: np.ndarray, ks=(1, 5, 10)) -> dict:
    out = {f"R@{k}": float((ranks <= k).mean()) for k in ks}
    out["MRR"] = float((1.0 / ranks).mean())
    out["median_rank"] = float(np.median(ranks))
    return out


# ── Detection (giao thức Open Images, rút gọn) ────────────────────────────
def _intersection(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    x1, y1 = np.maximum(box[0], boxes[:, 0]), np.maximum(box[1], boxes[:, 1])
    x2, y2 = np.minimum(box[2], boxes[:, 2]), np.minimum(box[3], boxes[:, 3])
    return np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)


def _iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    inter = _intersection(box, boxes)
    area = (box[2] - box[0]) * (box[3] - box[1])
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    return inter / np.maximum(area + areas - inter, 1e-12)


def _ioa(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    """Intersection / diện tích box dự đoán (dùng cho group-of)."""
    return _intersection(box, boxes) / max((box[2] - box[0]) * (box[3] - box[1]), 1e-12)


def detection_matches(dets: list[tuple[int, float, list[float]]],
                      gts: dict[int, tuple[np.ndarray, np.ndarray]],
                      iou_thr: float = 0.5, ioa_thr: float = 0.5) -> tuple[np.ndarray, np.ndarray, int]:
    """Khớp detection ↔ GT cho 1 lớp, theo cách Open Images xử lý box group-of:

    - `dets`: (ảnh, score, [x1,y1,x2,y2] 0–1) — CHỈ trên ảnh đã xác minh lớp này
      (positive hoặc negative); ảnh chưa xác minh phải lọc trước (bỏ qua, không tính FP).
    - `gts[ảnh] = (box thường (n,4), box group-of (m,4))`.
    - Khớp box thường trước (IoU ≥ iou_thr, mỗi box 1 lần); không khớp mà nằm trong
      box group-of (IoA ≥ ioa_thr) → detection điểm cao nhất của group đó là 1 TP,
      các detection sau trong cùng group bị bỏ qua. Mỗi box group-of = 1 GT.
    → (score, cờ 1 = TP / 0 = FP) theo score giảm dần (detection bị bỏ qua không có mặt), số GT.
    """
    n_gt = sum(len(n) + len(g) for n, g in gts.values())
    used = {i: np.zeros(len(n), bool) for i, (n, _) in gts.items()}
    group_used = {i: np.zeros(len(g), bool) for i, (_, g) in gts.items()}
    flags: list[int] = []  # 1 = TP, 0 = FP (bỏ qua thì không ghi)
    scores: list[float] = []

    def mark(score: float, flag: int) -> None:
        scores.append(score)
        flags.append(flag)

    empty = np.zeros((0, 4))
    for img, score, box in sorted(dets, key=lambda d: -d[1]):
        box = np.asarray(box, dtype=np.float64)
        normal, group = gts.get(img, (empty, empty))
        if len(normal):
            ious = _iou(box, normal)
            j = int(np.argmax(ious))
            if ious[j] >= iou_thr:
                mark(score, 0 if used[img][j] else 1)
                used[img][j] = True
                continue
        if len(group):
            ioas = _ioa(box, group)
            j = int(np.argmax(ioas))
            if ioas[j] >= ioa_thr:
                if not group_used[img][j]:
                    group_used[img][j] = True
                    mark(score, 1)
                continue  # detection phụ trong group → bỏ qua
        mark(score, 0)
    return np.asarray(scores, dtype=np.float64), np.asarray(flags, dtype=np.int8), n_gt


def detection_ap(dets: list[tuple[int, float, list[float]]],
                 gts: dict[int, tuple[np.ndarray, np.ndarray]],
                 iou_thr: float = 0.5, ioa_thr: float = 0.5) -> dict:
    """AP@IoU cho 1 lớp theo giao thức Open Images (khớp box: `detection_matches`)."""
    scores, flags, n_gt = detection_matches(dets, gts, iou_thr, ioa_thr)
    if n_gt == 0:
        return {"AP": float("nan"), "n_gt": 0, "n_det": len(dets), "tp": 0, "fp": len(dets)}
    tp = np.cumsum(np.asarray(flags) == 1)
    fp = np.cumsum(np.asarray(flags) == 0)
    if not len(flags):
        return {"AP": 0.0, "n_gt": n_gt, "n_det": 0, "tp": 0, "fp": 0}
    recall = tp / n_gt
    precision = tp / np.maximum(tp + fp, 1)
    # AP nội suy mọi điểm (VOC 2010+ / Open Images)
    mrec = np.r_[0.0, recall, 1.0]
    mpre = np.r_[0.0, precision, 0.0]
    mpre = np.maximum.accumulate(mpre[::-1])[::-1]
    idx = np.flatnonzero(mrec[1:] != mrec[:-1])
    ap = float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())
    return {"AP": ap, "n_gt": n_gt, "n_det": len(flags), "tp": int(tp[-1]), "fp": int(fp[-1])}


# ── Bootstrap ─────────────────────────────────────────────────────────────
def bootstrap_ci(stat_fn, n_items: int, n: int = 200, seed: int = 0, alpha: float = 0.05) -> dict:
    """CI percentile: stat_fn(idx) → {tên: giá trị} trên mẫu lại (có hoàn lại) của
    n_items phần tử (ảnh hoặc query). Trả {tên}_lo / {tên}_hi."""
    if n <= 0 or n_items == 0:
        return {}
    rng = np.random.default_rng(seed)
    samples: dict[str, list[float]] = {}
    for _ in range(n):
        idx = rng.integers(0, n_items, n_items)
        for k, v in stat_fn(idx).items():
            samples.setdefault(k, []).append(v)
    out = {}
    for k, vals in samples.items():
        vals = np.asarray(vals, dtype=np.float64)
        vals = vals[~np.isnan(vals)]
        if len(vals):
            out[f"{k}_lo"] = float(np.percentile(vals, 100 * alpha / 2))
            out[f"{k}_hi"] = float(np.percentile(vals, 100 * (1 - alpha / 2)))
    return out
