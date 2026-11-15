from fastapi import APIRouter, File, Request, UploadFile

from app.api.deps import read_image_or_400, run_model
from app.schemas.object_detect import ObjectDetectResponse

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
    detections = await run_model(request.app.state.object_lock, provider.detect, image_bytes)

    return ObjectDetectResponse(
        provider=provider.name,
        model=provider.model,
        detections=detections,
    )
