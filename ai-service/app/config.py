from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """AI service configuration.

    Prefix `AI_` — đọc từ env / root .env (cùng convention backend:
    `.env` nằm ở project root, ai-service đọc lên 1 cấp).
    """

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # Provider embedding cho semantic search: "stub" | "open_clip"
    # "stub"      = vector giả lập deterministic (không cần torch) — chạy skeleton.
    # "open_clip" = OpenCLIP image/text encoder, cần `open_clip_torch` + torch
    #               (model weights tự tải về cache lần chạy đầu).
    embed_provider: str = "stub"
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "laion2b_s34b_b79k"
    # "auto" = cuda > mps > cpu nếu có; hoặc ép "cpu" / "cuda" / "mps".
    clip_device: str = "auto"

    # Provider object detection (YOLO26): "stub" | "yolo"
    # "stub" = không cần model, trả về [] — dùng để chạy skeleton.
    # "yolo" = Ultralytics YOLO26 (COCO 80 class); weights tự tải lần đầu
    #          hoặc bake sẵn qua scripts/download_yolo_weight.py.
    object_provider: str = "stub"
    # Đường dẫn weights YOLO. Path tương đối tính từ thư mục ai-service/
    # (local: tải trước bằng scripts/download_yolo_weight.py → models/);
    # Docker dùng path tuyệt đối đã bake (vd /opt/yolo-cache/yolo26n.pt).
    yolo_weights: str = "models/yolo26n.pt"
    yolo_device: str = "auto"
    yolo_conf: float = 0.25
    yolo_imgsz: int = 640

    # Provider image similarity (DINOv3 — ảnh tương tự): "stub" | "dinov3"
    # "stub"   = vector giả lập 384 chiều (không cần weights).
    # "dinov3" = DINOv3 qua transformers; checkpoint GATED trên HF → tải trước
    #            bằng scripts/download_dino_weight.py (cần `hf auth login`).
    similarity_provider: str = "stub"
    # Path local (tương đối ai-service/) hoặc HF repo id. Backend lưu vector(384)
    # → giữ model 384 chiều (ViT-S/16 hoặc ViT-S+/16).
    dino_model: str = "models/dinov3-vits16-pretrain-lvd1689m"
    dino_device: str = "auto"

    # Gắn tag nội dung (classification) từ vector CLIP: đọc model .npz do
    # bench/cls_eval.py train. Path tương đối tính từ ai-service/. Config chỉ
    # nhận model dùng feature CLIP ("lp_clip" | "zs_clip"); thiếu file →
    # zero-shot cho nhóm tag đó.
    tag_models_dir: str = "bench/runs/cls"
    tag_config: str = "lp_clip"

    # CORS — FE web gọi trực tiếp API (dev).
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_prefix="AI_",
        env_file=(".env", "../.env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()