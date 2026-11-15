from fastapi import APIRouter, Request

from app import __version__

router = APIRouter(tags=["health"])


def _model(provider) -> str | None:
    return getattr(provider, "model", None) if provider is not None else None


@router.get("/health")
async def health_check(request: Request):
    """Liveness + model THỰC SỰ đã load (không phải cấu hình): stub hay model thật,
    tag dùng probe đã train hay zero-shot (thiếu file .npz là thấy ngay)."""
    state = request.app.state
    embed = getattr(state, "embed_provider", None)
    objects = getattr(state, "object_provider", None)
    similarity = getattr(state, "similarity_provider", None)
    tagger = getattr(state, "tagger", None)
    return {
        "status": "ok",
        "version": __version__,
        "embed_provider": getattr(embed, "name", None),
        "clip_model": _model(embed),
        "object_provider": getattr(objects, "name", None),
        "object_model": _model(objects),
        "similarity_provider": getattr(similarity, "name", None),
        "similarity_model": _model(similarity),
        "tagger": None if tagger is None else {
            "model": tagger.model,
            **tagger.mode,
            "label_count": len(tagger.label_ids),
        },
    }
