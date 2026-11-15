"""Chọn thiết bị torch dùng chung cho mọi provider (CLIP, DINOv3, YOLO) và bench."""
from __future__ import annotations


def resolve_device(device: str | None = "auto") -> str:
    """"auto" → cuda > mps (Apple Silicon) > cpu; giá trị khác giữ nguyên."""
    if device and device != "auto":
        return device
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"
