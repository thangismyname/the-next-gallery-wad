"""Shared FastAPI dependencies — image upload validation + multipart JSON parsing.

Các router dùng chung helper này để không validate lặp lại lẫn nhau
(trước đây object_detect.py import từ embed.py — phụ thuộc chéo giữa routers).
"""
from fastapi import HTTPException, UploadFile

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
