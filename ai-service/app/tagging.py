"""Gắn tag nội dung (17 tag, bench/cls_taxonomy.py) từ vector CLIP đã có.

Giống `TagSystem` của bench (bench/cls_eval.py) nhưng chỉ dùng feature CLIP —
vector mà backend đã lưu cho mọi ảnh (media_embeddings), nên gắn tag không
cần đọc lại ảnh:
    object    ← model COCO     bench/runs/cls/coco-<config>.npz
    scene     ← model Places6  bench/runs/cls/places6-<config>.npz
    attribute ← CLIP zero-shot (chưa có dữ liệu train)
Probe chỉ dùng khi train trên ĐÚNG model CLIP đang chạy (AI_CLIP_MODEL — đổi
sang CLIP đa ngôn ngữ thì cần train lại bằng `BENCH_CLIP=... bench.cls_eval`);
thiếu / không khớp → zero-shot cho nhóm đó.
Mỗi tag có ngưỡng riêng (tối ưu F1 trên val khi train); zero-shot dùng 0.5.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from bench.cls_models import ZeroShotClip, load_model
from bench.cls_taxonomy import (
    ATTRIBUTE_TAGS,
    GENERIC_NEGATIVES,
    OBJECT_TAGS,
    SCENE_TAGS,
    TAG_BY_ID,
    TAG_IDS,
    TAGS,
    TAXONOMY_VERSION,
)

logger = logging.getLogger(__name__)

AI_SERVICE_ROOT = Path(__file__).resolve().parent.parent
# CLIP mặc định của app/bench (AI_CLIP_MODEL) — probe cũ không ghi clip_model.
DEFAULT_CLIP_MODEL = "ViT-B-32"


def _zero_shot(provider, tags: list[str]) -> ZeroShotClip:
    """= ZeroShotClip.build (prompt ensembling) với provider của app."""

    def mean_text(texts: list[str]) -> np.ndarray:
        emb = np.asarray(provider.encode_texts(texts)).mean(axis=0)
        return emb / (np.linalg.norm(emb) or 1.0)

    pos = np.stack([mean_text(TAG_BY_ID[t]["prompts"]) for t in tags])
    neg = np.stack(
        [mean_text(TAG_BY_ID[t].get("negatives") or GENERIC_NEGATIVES) for t in tags]
    )
    return ZeroShotClip(tags, pos, neg, provider.logit_scale, single_label=False)


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
                model, source = _zero_shot(provider, tags), f"{dataset}-zero-shot"
            self.parts.append((tags, model, source))
        self.parts.append((ATTRIBUTE_TAGS, _zero_shot(provider, ATTRIBUTE_TAGS), "attribute-zero-shot"))

        self.thresholds = np.full(len(TAG_IDS), 0.5)
        for tags, model, _ in self.parts:
            self.thresholds[[TAG_IDS.index(t) for t in tags]] = model.thresholds
        # Ghi cả CLIP vào tên → đổi CLIP thì backend biết tag cũ đã lỗi thời.
        self.model = f"{provider.model}: " + " · ".join(src for _, _, src in self.parts)

    @staticmethod
    def _load_probe(directory: Path, filename: str, clip_model: str, tags: list[str]):
        """Probe train trên ĐÚNG CLIP đang chạy (vector khác model thì vô nghĩa).

        bench lưu CLIP mặc định ở `<dir>/`, CLIP khác ở `<dir>/<model>/`; file cũ
        chưa ghi `clip_model` được coi là CLIP mặc định.
        """
        for path in (directory / clip_model / filename, directory / filename):
            if not path.exists():
                continue
            loaded, meta = load_model(path)
            trained_on = meta.get("clip_model", DEFAULT_CLIP_MODEL)
            if (
                trained_on == clip_model
                and list(loaded.features) == ["clip"]
                and meta["tags"] == tags
            ):
                return loaded, path.stem
            logger.warning(
                "Bỏ qua %s: train trên CLIP %s, feature %s", path, trained_on, loaded.features
            )
        return None, None

    def predict(self, embeddings: np.ndarray) -> np.ndarray:
        """(N, D) vector CLIP unit-norm → xác suất (N, 17) theo thứ tự TAG_IDS."""
        feats = {"clip": embeddings}
        P = np.zeros((len(embeddings), len(TAG_IDS)))
        for tags, model, _ in self.parts:
            P[:, [TAG_IDS.index(t) for t in tags]] = model.predict(feats)
        return P

    def info(self) -> dict:
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
        }
