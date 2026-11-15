"""Shared FastAPI dependencies — image upload validation + multipart JSON parsing.

Các router dùng chung helper này để không validate lặp lại lẫn nhau
(trước đây object_detect.py import từ embed.py — phụ thuộc chéo giữa routers).
"""
import io
import threading
from typing import Any, Callable

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


async def read_image_or_400(file: UploadFile) -> bytes:
    """Kiểm tra content-type/kích thước rồi đọc hết file ảnh."""
    if not file.content_type or file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {file.content_type}. "
            f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {len(image_bytes)} bytes. Max: {MAX_FILE_SIZE}",
        )
    # Ảnh hỏng / không phải ảnh / quá nhiều pixel (decompression bomb) → 400 ở đây,
    # thay vì lỗi trong provider thành 500. verify() chỉ đọc header + cấu trúc, không decode cả ảnh.
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image") from exc
    return image_bytes


def parse_json_field(value: str, field_name: str) -> list[str]:
    """Parse field multipart dạng JSON array ('["dog","car"]')."""
    import json

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} không phải JSON hợp lệ: {exc}",
        ) from exc
    if not isinstance(parsed, list) or any(not isinstance(x, str) or not x for x in parsed):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} phải là JSON array các chuỗi không rỗng.",
        )
    return parsed


async def run_model(lock: threading.Lock, fn: Callable[..., Any], *args: Any) -> Any:
    """Chạy inference (CPU/GPU-bound) trong threadpool, tuần tự theo lock của model
    — không chặn event loop, không để 2 request tranh nhau cùng 1 model."""

    def _locked() -> Any:
        with lock:
            return fn(*args)

    return await run_in_threadpool(_locked)
