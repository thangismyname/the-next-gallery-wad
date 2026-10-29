"""Providers package — vision recognition backend implementations.

Có 3 nhóm provider:
- Embedding (semantic search): `get_embedding_provider()`
- Object detection:           `get_object_provider()`
- Image similarity (DINOv3):  `get_similarity_provider()`

Usage:
    vector = get_embedding_provider().encode_image(image_bytes)
    objects = get_object_provider().detect(image_bytes)
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.providers.embed_base import EmbeddingProvider
    from app.providers.object_base import ObjectDetectionProvider
    from app.providers.similarity_base import SimilarityProvider


def get_embedding_provider() -> EmbeddingProvider:
    """Lazily create and return the configured embedding provider."""
    from app.config import get_settings

    settings = get_settings()
    provider_name = settings.embed_provider

    if provider_name == "open_clip":
        from app.providers.clip import OpenClipEmbeddingProvider

        return OpenClipEmbeddingProvider(
            settings.clip_model,
            settings.clip_pretrained,
            settings.clip_device,
        )
    elif provider_name == "stub":
        from app.providers.embed_stub import StubEmbeddingProvider

        return StubEmbeddingProvider()
    else:
        raise ValueError(f"Unknown embedding provider: {provider_name!r}")


def get_object_provider() -> ObjectDetectionProvider:
    """Lazily create and return the configured object detection provider."""
    from app.config import get_settings

    settings = get_settings()
    provider_name = settings.object_provider

    if provider_name == "yolo":
        from app.providers.yolo import YoloObjectDetectionProvider

        return YoloObjectDetectionProvider(
            settings.yolo_weights,
            settings.yolo_device,
            settings.yolo_conf,
            settings.yolo_imgsz,
        )
    elif provider_name == "stub":
        from app.providers.object_stub import StubObjectDetectionProvider

        return StubObjectDetectionProvider()
    else:
        raise ValueError(f"Unknown object provider: {provider_name!r}")


def get_similarity_provider() -> SimilarityProvider:
    """Lazily create and return the configured image-similarity provider."""
    from app.config import get_settings

    settings = get_settings()
    provider_name = settings.similarity_provider

    if provider_name == "dinov3":
        from app.providers.dinov3 import Dinov3SimilarityProvider

        return Dinov3SimilarityProvider(settings.dino_model, settings.dino_device)
    elif provider_name == "stub":
        from app.providers.similarity_stub import StubSimilarityProvider

        return StubSimilarityProvider()
    else:
        raise ValueError(f"Unknown similarity provider: {provider_name!r}")
