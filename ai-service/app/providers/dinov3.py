"""DINOv3 image-similarity provider (Meta, 2025) qua Hugging Face transformers.

DINOv3 là vision foundation model tự giám sát (self-supervised, không dùng
text) — feature ảnh tổng quát, mạnh cho retrieval ảnh↔ảnh / gần trùng. Ta lấy
`pooler_output` (CLS token sau LayerNorm) làm global descriptor rồi chuẩn hoá L2.

Model mặc định ViT-S/16 distilled (`facebook/dinov3-vits16-pretrain-lvd1689m`,
21M params, 384 chiều, patch 16, 4 register tokens). Checkpoint trên HF là
GATED — phải chấp nhận license DINOv3 + `hf auth login` trước khi tải
(xem scripts/download_dino_weight.py).
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

from app.providers.similarity_base import SimilarityProvider

# Thư mục ai-service/ — gốc cho path weights tương đối (vd models/dinov3-...).
SERVICE_ROOT = Path(__file__).resolve().parents[2]

try:
    import torch
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Provider 'dinov3' cần torch + transformers. Cài đặt: uv sync "
        "hoặc đặt AI_SIMILARITY_PROVIDER=stub để chạy skeleton."
    ) from exc


class Dinov3SimilarityProvider(SimilarityProvider):
    def __init__(self, model: str, device: str = "auto") -> None:
        # import muộn — chỉ cần khi thực sự dùng provider này
        from transformers import AutoImageProcessor, AutoModel

        source = self._resolve_source(model)
        self._model_name = source.rstrip("/").rsplit("/", 1)[-1]
        self._device = self._resolve_device(device)

        self._processor = AutoImageProcessor.from_pretrained(source)
        self._model = AutoModel.from_pretrained(source).to(self._device).eval()
        self._dimension = int(self._model.config.hidden_size)

    @property
    def name(self) -> str:
        return "dinov3"

    @property
    def model(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    def encode_image(self, image_bytes: bytes) -> list[float]:
        return self.encode_images([image_bytes])[0].tolist()

    def encode_images(self, images: list[bytes]) -> np.ndarray:
        if not images:
            return np.zeros((0, self._dimension), dtype=np.float32)
        pil_images = [Image.open(io.BytesIO(b)).convert("RGB") for b in images]
        # Processor mặc định: resize 224×224 + chuẩn hoá ImageNet mean/std.
        inputs = self._processor(images=pil_images, return_tensors="pt").to(self._device)
        with torch.inference_mode():
            features = self._model(**inputs).pooler_output
            features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().numpy()

    @staticmethod
    def _resolve_source(model: str) -> str:
        """Path local (tương đối ai-service/) nếu đã tải trước, ngược lại là HF repo id."""
        path = Path(model)
        if not path.is_absolute():
            path = SERVICE_ROOT / path
        return str(path) if (path / "config.json").exists() else model

    @staticmethod
    def _resolve_device(device: str) -> str:
        if device and device != "auto":
            return device
        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
