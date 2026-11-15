"""Bộ phân loại tag dùng lúc chạy app — chỉ phần suy luận (numpy, không sklearn).

Model lưu ra .npz (chỉ mảng số + JSON, không pickle) do bench/experiments train;
phần train (LinearProbe.fit, metric) nằm ở bench/cls_models.py.
    ZeroShotClip   CLIP zero-shot: prompt ensembling; nhiều nhãn → p = σ(scale·(s_tag − s_neg)),
                   một nhãn → softmax trên các tag.
    LinearProbe    Logistic regression trên feature đã chuẩn hoá (clip / dino / yolo / ghép).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.tagging.taxonomy import GENERIC_NEGATIVES, TAG_BY_ID


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))


def softmax(x: np.ndarray) -> np.ndarray:
    z = x - x.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


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
        """`clip` = provider có encode_texts (→ (N, D) unit-norm) + logit_scale."""

        def mean_text(texts: list[str]) -> np.ndarray:
            emb = np.asarray(clip.encode_texts(texts)).mean(axis=0)
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


MODEL_CLASSES: dict[str, type] = {"zs_clip": ZeroShotClip, "linear_probe": LinearProbe}


def save_model(path: Path, model, extra: dict | None = None) -> None:
    meta = {"kind": model.kind, "tags": model.tags, "features": list(model.features),
            "single_label": bool(getattr(model, "single_label", False)),
            "val_score": getattr(model, "val_score", None), **(extra or {})}
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, meta=json.dumps(meta), thresholds=model.thresholds, **model.to_arrays())


def load_model(path: Path, classes: dict[str, type] | None = None):
    arrays = np.load(path, allow_pickle=False)
    meta = json.loads(str(arrays["meta"]))
    cls = (classes or MODEL_CLASSES)[meta["kind"]]
    return cls.from_arrays(meta, arrays), meta
