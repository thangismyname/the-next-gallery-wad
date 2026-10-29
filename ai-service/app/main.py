from contextlib import asynccontextmanager
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api import health, embed, object_detect, similarity, tags
from app.tagging import Tagger
from app.providers import (
    get_embedding_provider,
    get_object_provider,
    get_similarity_provider,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Embedding provider (OpenCLIP) load 1 lần tại startup — model nặng,
    # không tạo lại theo request.
    app.state.embed_provider = get_embedding_provider()
    # Object detection (YOLO26) — load 1 lần tại startup khi bật provider.
    app.state.object_provider = get_object_provider()
    # YOLO predict chạy tuần tự để tránh tranh chấp model trên CPU.
    app.state.object_lock = threading.Lock()
    # Image similarity (DINOv3) — load 1 lần tại startup khi bật provider.
    app.state.similarity_provider = get_similarity_provider()
    # Gắn tag nội dung — model nhỏ (.npz) chạy trên vector CLIP đã có.
    app.state.tagger = Tagger(
        app.state.embed_provider, settings.tag_models_dir, settings.tag_config
    )
    yield


app = FastAPI(
    title="The Next Gallery — AI Service",
    description="OpenCLIP embeddings for semantic search + YOLO26 object detection + DINOv3 image similarity + content tagging",
    version="0.4.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(embed.router, prefix="/api/v1", tags=["embedding"])
app.include_router(object_detect.router, prefix="/api/v1", tags=["object-detection"])
app.include_router(similarity.router, prefix="/api/v1", tags=["similarity"])
app.include_router(tags.router, prefix="/api/v1", tags=["tagging"])


@app.get("/")
async def root():
    return {
        "service": "ai-service",
        "version": "0.4.0",
        "docs": "/docs",
    }