"""Pydantic schemas cho embedding API (semantic search).

- `POST /api/v1/embed/image` → `EmbedResponse` (vector của ảnh)
- `POST /api/v1/embed/text`  → `EmbedResponse` (vector của câu truy vấn)
- `GET  /api/v1/embed/info`  → `EmbedInfoResponse` (provider/model/dimension)
"""
from pydantic import BaseModel, Field


class TextEmbedRequest(BaseModel):
    """Body cho POST /api/v1/embed/text."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=500,
        examples=["chó đang chạy trên bãi biển"],
        description="Câu truy vấn tự nhiên cần mã hoá.",
    )


class EmbedResponse(BaseModel):
    """Vector embedding trả về (đã chuẩn hoá L2)."""
    provider: str = Field(
        ...,
        examples=["open_clip"],
        description="Provider đang dùng: 'stub' | 'open_clip'.",
    )
    model: str = Field(
        ...,
        examples=["ViT-B-32"],
        description="Tên model (vd ViT-B-32 cho open_clip, 'stub' cho stub).",
    )
    dimension: int = Field(
        ...,
        examples=[512],
        description="Số chiều của vector.",
    )
    embedding: list[float] = Field(
        ...,
        description="Vector embedding, unit norm.",
    )


class EmbedInfoResponse(BaseModel):
    """Thông tin provider embedding hiện tại."""
    provider: str = Field(..., examples=["open_clip"])
    model: str = Field(..., examples=["ViT-B-32"])
    dimension: int = Field(..., examples=[512])


class ClipInfoResponse(EmbedInfoResponse):
    """Thông tin CLIP + logit_scale (nhiệt độ) — backend dùng để đổi cosine
    thành xác suất cho search kết hợp."""
    logit_scale: float = Field(..., examples=[100.0])


class ClassifyPrediction(BaseModel):
    """Một nhãn + xác suất zero-shot CLIP."""
    label: str = Field(..., examples=["car"], description="Nhãn dự đoán.")
    probability: float = Field(
        ...,
        examples=[0.92],
        description="Xác suất softmax (tổng = 1).",
    )
    similarity: float = Field(
        ...,
        examples=[0.32],
        description="Cosine similarity giữa ảnh và text nhãn.",
    )


class ClassifyResponse(BaseModel):
    """Kết quả zero-shot classify — demo CLIP paper."""
    provider: str = Field(..., examples=["open_clip"])
    model: str = Field(..., examples=["ViT-B-32"])
    dimension: int = Field(..., examples=[512])
    templates: list[str] = Field(
        ...,
        examples=[["a photo of a {}"]],
        description="Prompt templates đã dùng (prompt ensembling).",
    )
    predictions: list[ClassifyPrediction] = Field(
        ...,
        description="Các nhãn sắp theo probability giảm dần.",
    )
