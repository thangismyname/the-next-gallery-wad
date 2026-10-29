"""Base class for image-similarity providers (DINOv3).

Khác CLIP (ảnh + text cùng không gian), provider này CHỈ mã hoá ảnh — vector
tối ưu cho so khớp ảnh↔ảnh (ảnh tương tự / gần trùng). Vector trả về phải
chuẩn hoá L2 để backend dùng cosine (`<=>` của pgvector).
"""
from abc import ABC, abstractmethod

import numpy as np


class SimilarityProvider(ABC):
    """Abstract base — tất cả similarity providers phải implement interface này."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Tên provider (stub, dinov3...)."""
        ...

    @property
    @abstractmethod
    def model(self) -> str:
        """Tên model đang dùng (vd 'dinov3-vits16-pretrain-lvd1689m')."""
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Số chiều của vector embedding."""
        ...

    @abstractmethod
    def encode_image(self, image_bytes: bytes) -> list[float]:
        """Mã hoá ảnh thành vector embedding (unit norm)."""
        ...

    def encode_images(self, images: list[bytes]) -> np.ndarray:
        """Mã hoá nhiều ảnh một lượt → mảng (N, dimension) float32, unit norm."""
        return np.asarray([self.encode_image(image) for image in images], dtype=np.float32)
