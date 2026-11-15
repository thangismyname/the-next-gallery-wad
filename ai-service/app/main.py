import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __version__
from app.api import embed, health, object_detect, similarity, tags
from app.config import get_settings
from app.providers import (
    get_embedding_provider,
    get_object_provider,
    get_similarity_provider,
)
from app.tagging import Tagger

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Mọi model load 1 lần tại startup — nặng, không tạo lại theo request.
    app.state.embed_provider = get_embedding_provider()  # OpenCLIP
    app.state.object_provider = get_object_provider()  # YOLO26
    app.state.similarity_provider = get_similarity_provider()  # DINOv3
    # Mỗi model chạy tuần tự (1 lock / model): tránh tranh chấp GPU MPS / CPU
    # và đột biến bộ nhớ khi backend gửi nhiều ảnh song song (upload loạt).
    app.state.embed_lock = threading.Lock()
    app.state.object_lock = threading.Lock()
    app.state.similarity_lock = threading.Lock()
    # Gắn tag nội dung — probe nhỏ (.npz) chạy trên vector CLIP đã có.
    app.state.tagger = Tagger(
        app.state.embed_provider, settings.tag_models_dir, settings.tag_config
    )
    yield


app = FastAPI(
    title="The Next Gallery — AI Service",
    description=(
        "OpenCLIP embeddings (semantic search) + YOLO26 object detection + "
        "DINOv3 image similarity + content tagging (17 categories, 174 detailed labels). "
        "Internal only — the backend is the only client (no auth, no CORS)."
    ),
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.include_router(health.router)
app.include_router(embed.router, prefix="/api/v1", tags=["embedding"])
app.include_router(object_detect.router, prefix="/api/v1", tags=["object-detection"])
app.include_router(similarity.router, prefix="/api/v1", tags=["similarity"])
app.include_router(tags.router, prefix="/api/v1", tags=["tagging"])


@app.get("/")
async def root():
    return {"service": "ai-service", "version": __version__, "docs": "/docs"}
