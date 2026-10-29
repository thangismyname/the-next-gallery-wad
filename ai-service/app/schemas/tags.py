from pydantic import BaseModel, Field


class TagPredictRequest(BaseModel):
    """Vector CLIP image (unit norm) đã lưu ở backend — tối đa 500 / lần."""

    embeddings: list[list[float]] = Field(..., min_length=1, max_length=500)


class TagInfo(BaseModel):
    id: str
    group: str
    vi: str
    en: str
    threshold: float


class TagInfoResponse(BaseModel):
    model: str
    taxonomy_version: str
    dimension: int
    tags: list[TagInfo]


class TagPredictResponse(BaseModel):
    model: str
    taxonomy_version: str
    # Thứ tự cột của `scores` và `thresholds`.
    tags: list[str]
    thresholds: list[float]
    # scores[i][j] = xác suất ảnh i có tag j (0–1).
    scores: list[list[float]]
