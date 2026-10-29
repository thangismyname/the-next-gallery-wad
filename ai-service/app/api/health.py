from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    settings = get_settings()
    return {
        "status": "ok",
        "embed_provider": settings.embed_provider,
        "clip_model": settings.clip_model,
        "object_provider": settings.object_provider,
        "similarity_provider": settings.similarity_provider,
    }