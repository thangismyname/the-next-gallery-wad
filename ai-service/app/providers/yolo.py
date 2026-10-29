"""YOLO26 object detection provider.

Dùng `ultralytics` với model YOLO26 (COCO 80 class). Weights (`yolo26n.pt`)
tự tải về lần chạy đầu, hoặc được bake sẵn vào image qua
`scripts/download_yolo_weight.py` (xem Dockerfile).

Model nhẹ (YOLO26n ~2.4M params) chạy tốt trên CPU.
"""
from __future__ import annotations

import io
from pathlib import Path

from app.providers.object_base import ObjectDetectionProvider

# Thư mục ai-service/ — gốc cho path weights tương đối (vd models/yolo26n.pt).
SERVICE_ROOT = Path(__file__).resolve().parents[2]

try:
    import torch
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Provider 'yolo' cần torch. Cài đặt: pip install ultralytics "
        "hoặc đặt AI_OBJECT_PROVIDER=stub để chạy skeleton."
    ) from exc


class YoloObjectDetectionProvider(ObjectDetectionProvider):
    def __init__(
        self,
        weights: str = "yolo26n.pt",
        device: str = "auto",
        conf: float = 0.25,
        imgsz: int = 640,
    ) -> None:
        from ultralytics import YOLO  # import muộn — chỉ khi dùng provider này

        self._weights = weights
        self._model_name = weights.rsplit("/", 1)[-1].removesuffix(".pt")
        self._device = self._resolve_device(device)
        self._conf = float(conf)
        self._imgsz = int(imgsz)

        self._model = YOLO(self._resolve_weights(weights))

    @property
    def name(self) -> str:
        return "yolo"

    @property
    def model(self) -> str:
        return self._model_name

    def detect(self, image_bytes: bytes) -> list[dict]:
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = image.size
        if width == 0 or height == 0:
            return []

        results = self._model.predict(
            source=image,
            conf=self._conf,
            imgsz=self._imgsz,
            device=self._device,
            verbose=False,
        )

        detections: list[dict] = []
        for result in results:
            names = result.names or {}
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                detections.append(
                    {
                        "class_name": str(names.get(cls_id, cls_id)),
                        "confidence": round(confidence, 6),
                        "bbox": [
                            round(x1 / width, 6),
                            round(y1 / height, 6),
                            round(x2 / width, 6),
                            round(y2 / height, 6),
                        ],
                    }
                )

        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections

    @staticmethod
    def _resolve_weights(weights: str) -> str:
        """Path tương đối → tính từ ai-service/ (không phụ thuộc cwd)."""
        path = Path(weights)
        if path.is_absolute():
            return weights
        candidate = SERVICE_ROOT / path
        # Chưa tải trước → để Ultralytics tự tải theo tên (vd 'yolo26n.pt') về cwd.
        return str(candidate) if candidate.exists() else path.name

    @staticmethod
    def _resolve_device(device: str) -> str:
        if device and device != "auto":
            return device
        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
