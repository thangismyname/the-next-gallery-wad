"""Bộ phân loại tag + metric cho bench/cls_eval.py và bench/cls_prelabel.py.

Ba loại predictor, đều trả về `scores (N, T)` — xác suất trong [0, 1]:
    ZeroShotClip   CLIP zero-shot: prompt ensembling; nhiều nhãn → p = σ(scale·(s_tag − s_neg)),
                   một nhãn → softmax trên các tag.
    LinearProbe    Logistic regression trên feature đã chuẩn hoá (clip / dino / yolo / ghép).
                   Nhiều nhãn: 1 bộ phân loại / tag; một nhãn: multinomial. C chọn trên val.
    YoloRule       Baseline không học: điểm = confidence YOLO của class thuộc tag (luật
                   giống hệt luật sinh nhãn COCO → mạnh "giả tạo" trên COCO, ghi rõ khi báo cáo).

Model lưu ra .npz (chỉ mảng số + JSON) để app đọc lại được mà không cần pickle.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from bench.cls_taxonomy import GENERIC_NEGATIVES, TAG_BY_ID

# Regularization mạnh → yếu. Lần chạy đầu với lưới từ 0.01 chọn đúng mép dưới (0.01)
# → mở rộng xuống 0.001; fit() cảnh báo nếu C tốt nhất vẫn nằm ở mép lưới.
C_GRID = (0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0)
ECE_BINS = 15


# ── Zero-shot CLIP ────────────────────────────────────────────────────────
class ZeroShotClip:
    kind = "zs_clip"
    features = ("clip",)

    def __init__(self, tags: list[str], pos: np.ndarray, neg: np.ndarray, scale: float,
                 single_label: bool = False, thresholds: np.ndarray | None = None) -> None:
        self.tags, self.pos, self.neg, self.scale = tags, pos, neg, float(scale)
        self.single_label = single_label
        self.thresholds = thresholds if thresholds is not None else np.full(len(tags), 0.5)

    @classmethod
    def build(cls, clip, tags: list[str], single_label: bool = False) -> "ZeroShotClip":
        def mean_text(texts: list[str]) -> np.ndarray:
            emb = clip.encode_texts(texts).mean(axis=0)
            return emb / (np.linalg.norm(emb) or 1.0)

        pos = np.stack([mean_text(TAG_BY_ID[t]["prompts"]) for t in tags])
        neg = np.stack([mean_text(TAG_BY_ID[t].get("negatives") or GENERIC_NEGATIVES) for t in tags])
        return cls(tags, pos, neg, clip.logit_scale, single_label)

    def predict(self, feats: dict[str, np.ndarray]) -> np.ndarray:
        X = feats["clip"]
        s_pos = X @ self.pos.T
        if self.single_label:
            return softmax(self.scale * s_pos)
        s_neg = np.einsum("nd,td->nt", X, self.neg)
        return sigmoid(self.scale * (s_pos - s_neg))

    def to_arrays(self) -> dict:
        return {"pos": self.pos, "neg": self.neg, "scale": np.array(self.scale)}

    @classmethod
    def from_arrays(cls, meta: dict, arrays) -> "ZeroShotClip":
        return cls(meta["tags"], arrays["pos"], arrays["neg"], float(arrays["scale"]),
                   meta["single_label"], arrays["thresholds"])


# ── Linear probe ──────────────────────────────────────────────────────────
class LinearProbe:
    kind = "linear_probe"

    def __init__(self, tags: list[str], features: tuple[str, ...], single_label: bool,
                 mean: np.ndarray, scale: np.ndarray, coef: np.ndarray, intercept: np.ndarray,
                 C: float, thresholds: np.ndarray | None = None) -> None:
        self.tags, self.features, self.single_label = tags, tuple(features), single_label
        self.mean, self.scale, self.coef, self.intercept, self.C = mean, scale, coef, intercept, C
        self.thresholds = thresholds if thresholds is not None else np.full(len(tags), 0.5)

    @staticmethod
    def stack(feats: dict[str, np.ndarray], features) -> np.ndarray:
        return np.concatenate([feats[k] for k in features], axis=1)

    @classmethod
    def fit(cls, tags, features, single_label, feats_train, Y_train, feats_val, Y_val) -> "LinearProbe":
        """Chọn C theo val (mAP nếu nhiều nhãn, macro-F1 nếu một nhãn), fit lại trên train."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler

        Xtr, Xva = cls.stack(feats_train, features), cls.stack(feats_val, features)
        scaler = StandardScaler().fit(Xtr)
        Xtr, Xva = scaler.transform(Xtr), scaler.transform(Xva)
        best = None
        for C in C_GRID:
            if single_label:
                model = LogisticRegression(C=C, max_iter=3000).fit(Xtr, Y_train.argmax(1))
                coef, intercept = model.coef_, model.intercept_
            else:
                coef, intercept = _fit_ovr(Xtr, Y_train, C)
            probe = cls(tags, features, single_label, scaler.mean_, scaler.scale_, coef, intercept, C)
            P = probe._predict_scaled(Xva)
            score = (single_label_metrics(P, Y_val)["macro_f1"] if single_label
                     else multilabel_metrics(P, Y_val, np.full(len(tags), 0.5))["mAP"])
            if best is None or score > best[0]:
                best = (score, probe)
        probe = best[1]
        probe.val_score = best[0]
        if probe.C in (C_GRID[0], C_GRID[-1]):
            print(f"  ! {'+'.join(features)}: C={probe.C} ở mép lưới C_GRID — cân nhắc mở rộng", flush=True)
        return probe

    def _predict_scaled(self, Xs: np.ndarray) -> np.ndarray:
        logits = Xs @ self.coef.T + self.intercept
        return softmax(logits) if self.single_label else sigmoid(logits)

    def predict(self, feats: dict[str, np.ndarray]) -> np.ndarray:
        X = self.stack(feats, self.features)
        return self._predict_scaled((X - self.mean) / self.scale)

    def to_arrays(self) -> dict:
        return {"mean": self.mean, "scale": self.scale, "coef": self.coef,
                "intercept": self.intercept, "C": np.array(self.C)}

    @classmethod
    def from_arrays(cls, meta: dict, arrays) -> "LinearProbe":
        return cls(meta["tags"], tuple(meta["features"]), meta["single_label"], arrays["mean"],
                   arrays["scale"], arrays["coef"], arrays["intercept"], float(arrays["C"]),
                   arrays["thresholds"])


def _fit_ovr(X: np.ndarray, Y: np.ndarray, C: float) -> tuple[np.ndarray, np.ndarray]:
    """1 logistic regression / tag. Tag không có mẫu dương/âm → hằng số theo tần suất."""
    from sklearn.linear_model import LogisticRegression

    coef = np.zeros((Y.shape[1], X.shape[1]))
    intercept = np.zeros(Y.shape[1])
    for t in range(Y.shape[1]):
        y = Y[:, t]
        if y.all() or not y.any():
            p = np.clip(y.mean(), 1e-4, 1 - 1e-4)
            intercept[t] = np.log(p / (1 - p))
            continue
        model = LogisticRegression(C=C, max_iter=3000).fit(X, y)
        coef[t], intercept[t] = model.coef_[0], model.intercept_[0]
    return coef, intercept


# ── Luật YOLO (baseline không học) ────────────────────────────────────────
class YoloRule:
    kind = "yolo_rule"
    features = ("yolo",)

    def __init__(self, tags: list[str], class_names: list[str]) -> None:
        self.tags, self.names = tags, class_names
        self.index = {n: i for i, n in enumerate(class_names)}
        self.thresholds = np.full(len(tags), 0.5)

    def predict(self, feats: dict[str, np.ndarray]) -> np.ndarray:
        X = feats["yolo"]
        k = len(self.names)
        count, conf, area = np.expm1(X[:, :k]), X[:, k:2 * k], X[:, 2 * k:]
        p = self.index.get("person")
        out = np.zeros((len(X), len(self.tags)))
        for j, tag in enumerate(self.tags):
            rule = TAG_BY_ID[tag].get("coco")
            if tag == "group":
                out[:, j] = conf[:, p] * np.clip(count[:, p] / 3.0, 0, 1)
            elif tag == "portrait":
                one_or_two = (count[:, p] >= 1) & (count[:, p] <= 2)
                out[:, j] = conf[:, p] * one_or_two * np.clip(area[:, p] / 0.2, 0, 1)
            elif rule:
                idx = [self.index[c] for c in rule["classes"] if c in self.index]
                if not idx:  # model YOLO không có class nào của tag này
                    continue
                big = area[:, idx] >= rule.get("min_area", 0.0)
                out[:, j] = (conf[:, idx] * np.where(big, 1.0, 0.3)).max(axis=1)
        return out


# ── Ngưỡng + metric ───────────────────────────────────────────────────────
def tune_thresholds(P: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """Ngưỡng / tag tối đa F1 trên val (tag không có mẫu dương → 0.5)."""
    out = np.full(P.shape[1], 0.5)
    for t in range(P.shape[1]):
        y = Y[:, t]
        if not y.any():
            continue
        cands = np.unique(np.round(P[:, t], 4))
        best = (-1.0, 0.5)
        for thr in cands[:: max(1, len(cands) // 200)]:
            pred = P[:, t] >= thr
            tp = (pred & y).sum()
            f1 = 2 * tp / max(1, pred.sum() + y.sum())
            if f1 > best[0]:
                best = (f1, float(thr))
        out[t] = best[1]
    return out


def ece(probs: np.ndarray, correct: np.ndarray, bins: int = ECE_BINS) -> float:
    """Expected Calibration Error (%): |độ tin cậy − độ chính xác| có trọng số theo bin."""
    probs, correct = probs.ravel(), correct.ravel().astype(float)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (probs > lo) & (probs <= hi) if lo > 0 else (probs >= lo) & (probs <= hi)
        if m.any():
            total += m.mean() * abs(probs[m].mean() - correct[m].mean())
    return round(100 * total, 2)


def multilabel_metrics(P: np.ndarray, Y: np.ndarray, thresholds: np.ndarray, tags=None) -> dict:
    from sklearn.metrics import average_precision_score

    pred = P >= thresholds
    per_tag, aps, f1s = [], [], []
    for t in range(Y.shape[1]):
        y = Y[:, t]
        tp, fp, fn = int((pred[:, t] & y).sum()), int((pred[:, t] & ~y).sum()), int((~pred[:, t] & y).sum())
        precision = tp / max(1, tp + fp)
        recall = tp / max(1, tp + fn)
        f1 = 2 * tp / max(1, 2 * tp + fp + fn)
        ap = float(average_precision_score(y, P[:, t])) if y.any() else float("nan")
        if y.any():
            aps.append(ap)
            f1s.append(f1)
        per_tag.append({"tag": tags[t] if tags else t, "support": int(y.sum()), "AP": ap,
                        "precision": precision, "recall": recall, "f1": f1,
                        "threshold": float(thresholds[t])})
    tp, fp, fn = (pred & Y).sum(), (pred & ~Y).sum(), (~pred & Y).sum()
    return {
        "mAP": round(100 * float(np.mean(aps)), 2) if aps else float("nan"),
        "macro_f1": round(100 * float(np.mean(f1s)), 2) if f1s else float("nan"),
        "micro_f1": round(100 * 2 * tp / max(1, 2 * tp + fp + fn), 2),
        "ece": ece(P, Y),
        "per_tag": per_tag,
    }


def single_label_metrics(P: np.ndarray, Y: np.ndarray, tags=None) -> dict:
    from sklearn.metrics import balanced_accuracy_score, f1_score

    import warnings

    y, pred = Y.argmax(1), P.argmax(1)
    with warnings.catch_warnings():  # mẫu bootstrap có thể thiếu 1 lớp → sklearn cảnh báo
        warnings.simplefilter("ignore", UserWarning)
        balanced_acc = balanced_accuracy_score(y, pred)
    top2 = (np.argsort(-P, axis=1)[:, :2] == y[:, None]).any(axis=1)
    per_tag = []
    for t in range(Y.shape[1]):
        tp = int(((pred == t) & (y == t)).sum())
        per_tag.append({"tag": tags[t] if tags else t, "support": int((y == t).sum()),
                        "precision": tp / max(1, int((pred == t).sum())),
                        "recall": tp / max(1, int((y == t).sum())),
                        "f1": 2 * tp / max(1, int((pred == t).sum()) + int((y == t).sum())),
                        "AP": float("nan"), "threshold": float("nan")})
    return {
        "top1": round(100 * float((pred == y).mean()), 2),
        "top2": round(100 * float(top2.mean()), 2),
        "macro_f1": round(100 * float(f1_score(y, pred, average="macro", zero_division=0)), 2),
        "balanced_acc": round(100 * float(balanced_acc), 2),
        "ece": ece(P.max(1), pred == y),
        "per_tag": per_tag,
    }


# ── Khoảng tin cậy + ma trận nhầm lẫn ─────────────────────────────────────
def headline_metrics(P: np.ndarray, Y: np.ndarray, single_label: bool,
                     thresholds: np.ndarray | None = None) -> dict:
    """Metric chính dùng cho bootstrap (không kèm per_tag)."""
    if single_label:
        m = single_label_metrics(P, Y)
        return {"top1": m["top1"], "macro_f1": m["macro_f1"]}
    m = multilabel_metrics(P, Y, thresholds if thresholds is not None else np.full(Y.shape[1], 0.5))
    return {"mAP": m["mAP"], "macro_f1": m["macro_f1"]}


def bootstrap_ci(P: np.ndarray, Y: np.ndarray, single_label: bool, thresholds=None,
                 n: int = 1000, seed: int = 0, alpha: float = 0.05) -> dict:
    """Khoảng tin cậy 95% (percentile bootstrap, lấy mẫu lại ảnh test có hoàn lại).

    Trả {metric}_ci_lo / {metric}_ci_hi. Hai cấu hình có CI KHÔNG chồng nhau → khác
    biệt chắc chắn có ý nghĩa; chồng nhau → chưa kết luận được (kiểm định bảo thủ).
    """
    if n <= 0:
        return {}
    rng = np.random.default_rng(seed)
    samples: dict[str, list[float]] = {}
    for _ in range(n):
        idx = rng.integers(0, len(P), len(P))
        for k, v in headline_metrics(P[idx], Y[idx], single_label, thresholds).items():
            samples.setdefault(k, []).append(v)
    out = {}
    for k, vals in samples.items():
        vals = np.asarray(vals, dtype=float)
        vals = vals[~np.isnan(vals)]
        if len(vals):
            out[f"{k}_ci_lo"] = round(float(np.percentile(vals, 100 * alpha / 2)), 2)
            out[f"{k}_ci_hi"] = round(float(np.percentile(vals, 100 * (1 - alpha / 2))), 2)
    return out


def confusion_rows(P: np.ndarray, Y: np.ndarray, tags: list[str]) -> list[dict]:
    """Ma trận nhầm lẫn (1 nhãn) dạng hàng: {true, pred, count}."""
    y, pred = Y.argmax(1), P.argmax(1)
    return [{"true": tags[i], "pred": tags[j], "count": int(((y == i) & (pred == j)).sum())}
            for i in range(len(tags)) for j in range(len(tags))]


# ── Lưu / đọc ─────────────────────────────────────────────────────────────
def save_model(path: Path, model, extra: dict | None = None) -> None:
    meta = {"kind": model.kind, "tags": model.tags, "features": list(model.features),
            "single_label": bool(getattr(model, "single_label", False)),
            "val_score": getattr(model, "val_score", None), **(extra or {})}
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, meta=json.dumps(meta), thresholds=model.thresholds, **model.to_arrays())


def load_model(path: Path):
    arrays = np.load(path, allow_pickle=False)
    meta = json.loads(str(arrays["meta"]))
    cls = {"zs_clip": ZeroShotClip, "linear_probe": LinearProbe}[meta["kind"]]
    return cls.from_arrays(meta, arrays), meta


# ── Tiện ích ──────────────────────────────────────────────────────────────
def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))


def softmax(x: np.ndarray) -> np.ndarray:
    z = x - x.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def timed(fn, *args):
    t0 = time.perf_counter()
    out = fn(*args)
    return out, time.perf_counter() - t0
