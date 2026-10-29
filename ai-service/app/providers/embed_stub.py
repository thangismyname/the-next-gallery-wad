"""Stub embedding provider — deterministic vector, no model.

Dùng để chạy skeleton / test end-to-end khi chưa cài torch/open_clip.
Vector sinh từ hash SHA-256 của input nên ổn định giữa các lần chạy và
có unit norm (đủ để pipeline search chạy, dù không mang ngữ nghĩa thật).
"""
import hashlib
import math
import random

import numpy as np

from app.providers.embed_base import EmbeddingProvider

STUB_DIMENSION = 512
STUB_MODEL = "stub"
STUB_LOGIT_SCALE = 60.0


class StubEmbeddingProvider(EmbeddingProvider):
    @property
    def name(self) -> str:
        return "stub"

    @property
    def model(self) -> str:
        return STUB_MODEL

    @property
    def dimension(self) -> int:
        return STUB_DIMENSION

    @property
    def logit_scale(self) -> float:
        return STUB_LOGIT_SCALE

    def encode_image(self, image_bytes: bytes) -> list[float]:
        return self._vector(b"image:" + image_bytes)

    def encode_text(self, text: str) -> list[float]:
        return self._vector(b"text:" + text.encode("utf-8"))

    def classify(
        self,
        image_bytes: bytes,
        labels: list[str],
        templates: list[str] | None = None,
    ) -> list[dict]:
        if len(labels) < 2:
            raise ValueError("Cần ít nhất 2 nhãn để classify (softmax).")

        image_vec = np.asarray(self.encode_image(image_bytes), dtype=np.float64)
        text_vecs = {
            label: np.asarray(self.encode_text(label), dtype=np.float64)
            for label in labels
        }

        similarities = [
            float(np.dot(image_vec, text_vecs[label])) for label in labels
        ]
        logits = np.asarray(similarities, dtype=np.float64) * STUB_LOGIT_SCALE
        logits -= logits.max()
        exp = np.exp(logits)
        probabilities = exp / exp.sum()

        predictions = [
            {
                "label": label,
                "probability": round(float(prob), 6),
                "similarity": round(float(sim), 6),
            }
            for label, prob, sim in zip(labels, probabilities, similarities)
        ]
        predictions.sort(key=lambda p: p["probability"], reverse=True)
        return predictions

    @staticmethod
    def _vector(seed_bytes: bytes) -> list[float]:
        digest = hashlib.sha256(seed_bytes).digest()
        rng = random.Random(int.from_bytes(digest, "big"))
        values = [rng.gauss(0.0, 1.0) for _ in range(STUB_DIMENSION)]
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]
