from fastapi import APIRouter, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import read_image_or_400
from app.schemas.embed import EmbedInfoResponse, EmbedResponse

router = APIRouter()


@router.post("/similarity/embed", response_model=EmbedResponse)
async def similarity_embed(request: Request, file: UploadFile = File(...)):
    """Mã hoá 1 ảnh thành descriptor DINOv3 (so khớp ảnh↔ảnh, không có text)."""
    image_bytes = await read_image_or_400(file)

    provider = request.app.state.similarity_provider
    embedding = await run_in_threadpool(provider.encode_image, image_bytes)

    return EmbedResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
        embedding=embedding,
    )


@router.get("/similarity/info", response_model=EmbedInfoResponse)
async def similarity_info(request: Request):
    """Thông tin provider similarity đang dùng (provider/model/dimension)."""
    provider = request.app.state.similarity_provider
    return EmbedInfoResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
    )
