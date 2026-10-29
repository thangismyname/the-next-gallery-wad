from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import parse_json_field, read_image_or_400
from app.schemas.embed import (
    ClassifyResponse,
    ClipInfoResponse,
    EmbedResponse,
    TextEmbedRequest,
)

router = APIRouter()


@router.post("/embed/image", response_model=EmbedResponse)
async def embed_image(request: Request, file: UploadFile = File(...)):
    """Mã hoá 1 ảnh thành vector embedding (CLIP image encoder)."""
    image_bytes = await read_image_or_400(file)

    provider = request.app.state.embed_provider
    # Inference CPU-bound → chạy trong threadpool để không chặn event loop
    # (không thì mọi request khác, kể cả /health, đều stall trong lúc encode).
    embedding = await run_in_threadpool(provider.encode_image, image_bytes)

    return EmbedResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
        embedding=embedding,
    )


@router.post("/embed/text", response_model=EmbedResponse)
async def embed_text(request: Request, payload: TextEmbedRequest):
    """Mã hoá câu truy vấn text thành vector embedding (CLIP text encoder)."""
    provider = request.app.state.embed_provider
    embedding = await run_in_threadpool(provider.encode_text, payload.text)

    return EmbedResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
        embedding=embedding,
    )


@router.post("/classify", response_model=ClassifyResponse)
async def classify_image(
    request: Request,
    file: UploadFile = File(...),
    labels: str = Form(..., description='JSON array nhãn, vd ["dog","car","cat"]'),
    templates: str = Form(
        '["a photo of a {}"]',
        description="JSON array prompt templates CLIP (chứa {} cho nhãn).",
    ),
):
    """Zero-shot classify — demo giống CLIP paper.

    Gửi 1 ảnh + danh sách nhãn → trả xác suất softmax từng nhãn
    (so cosine image/text rồi scale bằng logit_scale của model).
    """
    image_bytes = await read_image_or_400(file)
    label_list = parse_json_field(labels, "labels")
    template_list = parse_json_field(templates, "templates")
    if len(label_list) < 2:
        raise HTTPException(
            status_code=400,
            detail="labels phải có ít nhất 2 nhãn (softmax cần ≥2 lớp).",
        )

    provider = request.app.state.embed_provider
    predictions = await run_in_threadpool(
        provider.classify, image_bytes, label_list, template_list
    )

    return ClassifyResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
        templates=template_list,
        predictions=predictions,
    )


@router.get("/embed/info", response_model=ClipInfoResponse)
async def embed_info(request: Request):
    """Thông tin provider embedding đang dùng (provider/model/dimension/logit_scale)."""
    provider = request.app.state.embed_provider
    return ClipInfoResponse(
        provider=provider.name,
        model=provider.model,
        dimension=provider.dimension,
        logit_scale=provider.logit_scale,
    )
