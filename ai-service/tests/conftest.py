"""Shared test fixtures — stub providers, không cần torch/model.

Env phải được set TRƯỚC khi import app.main (Settings đọc env lúc khởi tạo).
"""
import os

os.environ.setdefault("AI_EMBED_PROVIDER", "stub")
os.environ.setdefault("AI_OBJECT_PROVIDER", "stub")
os.environ.setdefault("AI_SIMILARITY_PROVIDER", "stub")

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture()
def client():
    # `with TestClient` để chạy lifespan (load providers vào app.state).
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def tiny_png() -> bytes:
    """1x1 PNG hợp lệ để upload qua multipart."""
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def png_upload(tiny_png):
    """Helper: multipart file dict cho TestClient.post(..., files=...)."""
    return {"file": ("test.png", tiny_png, "image/png")}
