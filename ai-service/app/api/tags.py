import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from app.schemas.tags import TagInfoResponse, TagPredictRequest, TagPredictResponse

router = APIRouter()


@router.post("/tags/predict", response_model=TagPredictResponse)
async def tags_predict(request: Request, body: TagPredictRequest):
    """Chấm 17 tag danh mục + 174 nhãn chi tiết từ vector CLIP image đã có (không cần gửi ảnh)."""
    tagger = request.app.state.tagger
    X = np.asarray(body.embeddings, dtype=np.float32)
    if X.ndim != 2 or X.shape[1] != tagger.dimension:
        raise HTTPException(400, f"Mỗi embedding phải có {tagger.dimension} chiều")

    def _predict():
        return tagger.predict(X), tagger.predict_labels(X)

    P, L = await run_in_threadpool(_predict)
    info = tagger.info()
    return TagPredictResponse(
        model=info["model"],
        taxonomy_version=info["taxonomy_version"],
        tags=[t["id"] for t in info["tags"]],
        thresholds=[t["threshold"] for t in info["tags"]],
        scores=np.round(P, 4).tolist(),
        labels=[t["id"] for t in info["labels"]],
        label_thresholds=[t["threshold"] for t in info["labels"]],
        label_scores=np.round(L, 4).tolist() if L is not None else [],
    )


@router.get("/tags/info", response_model=TagInfoResponse)
async def tags_info(request: Request):
    """Danh mục tag + nhãn chi tiết + ngưỡng + model đang dùng cho từng nhóm."""
    return request.app.state.tagger.info()
