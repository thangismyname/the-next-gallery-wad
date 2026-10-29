from fastapi import APIRouter, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import read_image_or_400
from app.schemas.object_detect import ObjectDetection, ObjectDetectResponse

router = APIRouter()


@router.post("/detect/objects", response_model=ObjectDetectResponse)
async def detect_objects(request: Request, file: UploadFile = File(...)):
    """Phát hiện object trong 1 ảnh bằng YOLO26.

    Nhận 1 file ảnh (JPEG/PNG/WebP/GIF) → trả `ObjectDetectResponse`
    gồm danh sách object (class COCO + confidence + bbox chuẩn hoá 0–1).
    Provider 'stub' trả về danh sách rỗng.
    """
    image_bytes = await read_image_or_400(file)

    provider = request.app.state.object_provider
    lock = request.app.state.object_lock

    def _detect() -> list[dict]:
        # YOLO predict tuần tự qua lock (tránh tranh chấp model trên CPU);
        # chạy trong threadpool để không chặn event loop.
        with lock:
            return provider.detect(image_bytes)

    detections = await run_in_threadpool(_detect)

    return ObjectDetectResponse(
        provider=provider.name,
        model=provider.model,
        detections=detections,
    )
