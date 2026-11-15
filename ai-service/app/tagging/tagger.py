"""Gắn tag nội dung từ vector CLIP đã có (backend gửi vector, không gửi ảnh).

Hai tầng:
  1. 17 tag danh mục (taxonomy.py) — mỗi nhóm một model:
        object    ← probe COCO     <dir>/coco-<config>.npz      (bench/cls_eval.py)
        scene     ← probe Places6  <dir>/places6-<config>.npz
        attribute ← CLIP zero-shot (chưa có dữ liệu train)
  2. 174 nhãn chi tiết Open Images (labels.py) ← <dir>/oi-<config>.npz
     (experiments probe → export_tags). Thiếu file → chỉ có tầng 1.

Probe chỉ dùng khi train trên ĐÚNG model CLIP đang chạy (vector khác model thì vô
nghĩa); thiếu / không khớp → zero-shot cho nhóm đó (tầng 1) hoặc bỏ tầng 2.
Mỗi tag có ngưỡng riêng (chọn trên val khi train); zero-shot dùng 0.5.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from app.tagging.classifiers import ZeroShotClip, load_model
from app.tagging.labels import LABEL_PREFIX, SECTIONS, label_catalog, load_label_probe
from app.tagging.taxonomy import (
    ATTRIBUTE_TAGS,
    OBJECT_TAGS,
    SCENE_TAGS,
    TAG_IDS,
    TAGS,
    TAXONOMY_VERSION,
)

logger = logging.getLogger(__name__)

AI_SERVICE_ROOT = Path(__file__).resolve().parents[2]
# CLIP mặc định của app/bench (AI_CLIP_MODEL) — probe cũ không ghi clip_model.
DEFAULT_CLIP_MODEL = "ViT-B-32"


class Tagger:
    def __init__(self, provider, models_dir: str, config: str) -> None:
        self.dimension = provider.dimension
        directory = Path(models_dir)
        if not directory.is_absolute():
            directory = AI_SERVICE_ROOT / directory

        self.parts: list[tuple[list[str], object, str]] = []
        for dataset, tags in (("coco", OBJECT_TAGS), ("places6", SCENE_TAGS)):
            model, source = self._load_probe(directory, f"{dataset}-{config}.npz", provider.model, tags)
            if model is None:
                logger.warning("Không có probe %s cho CLIP %s — dùng zero-shot", dataset, provider.model)
                model, source = ZeroShotClip.build(provider, tags), f"{dataset}-zero-shot"
            self.parts.append((tags, model, source))
        self.parts.append((ATTRIBUTE_TAGS, ZeroShotClip.build(provider, ATTRIBUTE_TAGS), "attribute-zero-shot"))

        self.thresholds = np.full(len(TAG_IDS), 0.5)
        for tags, model, _ in self.parts:
            self.thresholds[[TAG_IDS.index(t) for t in tags]] = model.thresholds

        self.labels = load_label_probe(directory, config, provider.model)
        if self.labels is None:
            logger.warning("Không có probe nhãn chi tiết oi-%s cho CLIP %s — chỉ gắn 17 tag",
                           config, provider.model)
        sources = [src for _, _, src in self.parts]
        if self.labels is not None:
            sources.append(self.labels.source)
        # Ghi cả CLIP vào tên → đổi CLIP / probe thì backend biết tag cũ đã lỗi thời.
        self.model = f"{provider.model}: " + " · ".join(sources)

    @staticmethod
    def _load_probe(directory: Path, filename: str, clip_model: str, tags: list[str]):
        """`<dir>/<clip model>/` (CLIP khác mặc định) rồi `<dir>/`; file cũ không ghi
        `clip_model` được coi là CLIP mặc định."""
        for path in (directory / clip_model / filename, directory / filename):
            if not path.exists():
                continue
            loaded, meta = load_model(path)
            trained_on = meta.get("clip_model", DEFAULT_CLIP_MODEL)
            if trained_on == clip_model and list(loaded.features) == ["clip"] and meta["tags"] == tags:
                return loaded, path.stem
            logger.warning("Bỏ qua %s: train trên CLIP %s, feature %s", path, trained_on, loaded.features)
        return None, None

    @property
    def label_ids(self) -> list[str]:
        return [LABEL_PREFIX + r["id"] for r in label_catalog()] if self.labels is not None else []

    @property
    def mode(self) -> dict:
        """Nguồn thật đang dùng (cho /health): probe đã train hay zero-shot."""
        return {
            "categories": {src.split("-", 1)[0]: ("zero-shot" if src.endswith("zero-shot") else src)
                           for _, _, src in self.parts},
            "labels": self.labels.source if self.labels is not None else None,
        }

    def predict(self, embeddings: np.ndarray) -> np.ndarray:
        """(N, D) vector CLIP unit-norm → xác suất (N, 17) theo thứ tự TAG_IDS."""
        feats = {"clip": embeddings}
        P = np.zeros((len(embeddings), len(TAG_IDS)))
        for tags, model, _ in self.parts:
            P[:, [TAG_IDS.index(t) for t in tags]] = model.predict(feats)
        return P

    def predict_labels(self, embeddings: np.ndarray) -> np.ndarray | None:
        """(N, D) → xác suất đã calibrate (N, 174) theo thứ tự label_ids; không có probe → None."""
        return None if self.labels is None else self.labels.predict(embeddings)

    def info(self) -> dict:
        """Danh mục + ngưỡng (cố định sau khi load → tính 1 lần)."""
        if getattr(self, "_info", None) is None:
            self._info = self._build_info()
        return self._info

    def _build_info(self) -> dict:
        labels = []
        if self.labels is not None:
            labels = [
                {
                    "id": LABEL_PREFIX + r["id"],
                    "section": r["section"],
                    "en": r["en"],
                    "vi": r["vi"],
                    "ja": r["ja"],
                    "threshold": round(float(self.labels.thresholds[i]), 4),
                }
                for i, r in enumerate(label_catalog())
            ]
        return {
            "model": self.model,
            "taxonomy_version": TAXONOMY_VERSION,
            "dimension": self.dimension,
            "tags": [
                {
                    "id": t["id"],
                    "group": t["group"],
                    "vi": t["vi"],
                    "en": t["en"],
                    "threshold": round(float(self.thresholds[i]), 4),
                }
                for i, t in enumerate(TAGS)
            ],
            "sections": list(SECTIONS),
            "labels": labels,
            "label_model": self.labels.meta if self.labels is not None else None,
        }
