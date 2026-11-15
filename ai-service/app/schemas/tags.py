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


class LabelInfo(BaseModel):
    """Nhãn chi tiết (Open Images) — id dạng "oi.<tên>", nhóm hiển thị `section`."""

    id: str
    section: str
    en: str
    vi: str
    ja: str
    threshold: float


class TagInfoResponse(BaseModel):
    model: str
    taxonomy_version: str
    dimension: int
    tags: list[TagInfo]
    # Thứ tự nhóm nhãn chi tiết trong UI; `labels` rỗng khi chưa có probe.
    sections: list[str] = []
    labels: list[LabelInfo] = []
    label_model: dict | None = None


class TagPredictResponse(BaseModel):
    model: str
    taxonomy_version: str
    # Thứ tự cột của `scores` và `thresholds`.
    tags: list[str]
    thresholds: list[float]
    # scores[i][j] = xác suất ảnh i có tag j (0–1).
    scores: list[list[float]]
    # Nhãn chi tiết (đã calibrate) — cùng quy ước; rỗng khi chưa có probe.
    labels: list[str] = []
    label_thresholds: list[float] = []
    label_scores: list[list[float]] = []
