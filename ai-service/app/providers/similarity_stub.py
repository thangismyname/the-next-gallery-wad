"""Stub similarity provider — deterministic vector, no model.

Dùng để chạy skeleton / test khi chưa tải weights DINOv3 (model gated trên HF).
Cùng số chiều với DINOv3 ViT-S/16 (384) để khớp cột pgvector của backend.
"""
import hashlib
import math
import random

from app.providers.similarity_base import SimilarityProvider

STUB_DIMENSION = 384


class StubSimilarityProvider(SimilarityProvider):
    @property
    def name(self) -> str:
        return "stub"

    @property
    def model(self) -> str:
        return "stub"

    @property
    def dimension(self) -> int:
        return STUB_DIMENSION

    def encode_image(self, image_bytes: bytes) -> list[float]:
        digest = hashlib.sha256(b"dino:" + image_bytes).digest()
        rng = random.Random(int.from_bytes(digest, "big"))
        values = [rng.gauss(0.0, 1.0) for _ in range(STUB_DIMENSION)]
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]
