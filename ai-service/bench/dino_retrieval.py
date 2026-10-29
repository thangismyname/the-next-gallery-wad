"""Tái lập instance retrieval của DINOv3 (paper Table 14, cột "Ox.-H").

Protocol (DINOv3 paper, Appendix D.8): mỗi ảnh → CLS token (pooler_output, sau
LayerNorm cuối), chuẩn hoá L2; database xếp hạng theo cosine với query; metric
mAP Revisited Oxford/Paris (Easy/Medium/Hard — paper báo Hard). Oxford/Paris:
"resize cạnh lớn = 224 px, giữ tỉ lệ, rồi full center crop → 224×224" — tức
CenterCrop(224) của torchvision tự đệm viền đen cho cạnh ngắn (letterbox).

So sánh trong 1 lần chạy:
  - DINOv3 ViT-S/16 (model app), S+/16, B/16 (+ L/16 tuỳ chọn)  — Table 14
  - DINOv2 small/base (+ bản with registers — Sec. 6.1 ghi baseline là
    "DINOv2 with registers"; Table 14 không nói rõ → đo cả hai)       — Table 14
  - clip-app: CLIP ViT-B-32 laion2b (model semantic search của app) — lý do dùng
    DINO thay CLIP cho "ảnh tương tự" (không có số công bố)

`--preprocess` (ablation):
  pad224    cạnh lớn 224 px giữ tỉ lệ + đệm đen thành 224×224 — đúng App. D.8 (mặc định)
  long224   cạnh lớn 224 px giữ tỉ lệ, KHÔNG đệm, cạnh làm tròn bội số patch
  square224 ép 224×224 bằng image processor của HF — đúng provider của app
  app       giả lập backend (sharp: xoay EXIF, cạnh ≤512 px, WebP q85) rồi square224
            — đúng đường đi ảnh thật của tính năng "Ảnh tương tự"
`--query-crop bbox` (mặc định, protocol revisitop chuẩn) | `full` (cả ảnh query).

Usage (từ ai-service/, dataset + quyền model theo bench/README.md):
    uv run python -m bench.dino_retrieval                                   # mặc định, cả 2 dataset
    uv run python -m bench.dino_retrieval --models dinov3-vits16 --datasets roxford5k \\
        --preprocess pad224 long224 square224 app                           # ablation pipeline app
    uv run python -m bench.dino_retrieval --models dinov3-vits16 --limit-queries 5   # smoke
"""
from __future__ import annotations

import argparse
import io
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from bench.common import (
    DEFAULT_DATA_ROOT,
    MODELS_DIR,
    RESULTS_DIR,
    append_csv,
    environment_info,
    sha256_of,
    utc_now,
)
from bench.published import DINO_RETRIEVAL, DINO_SOURCE
from bench.revisitop import DATASETS, KAPPAS, PROTOCOLS, evaluate, load_revisitop

RESULTS_CSV = RESULTS_DIR / "dino_retrieval.csv"
PAPER_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
APP_MAX_EDGE = 512  # backend similarity.service.js toDinoBuffer
APP_WEBP_QUALITY = 85

# Tên ngắn → HF repo. Checkpoint DINOv3 là GATED (mỗi repo phải chấp nhận license).
MODELS = {
    "dinov3-vits16": {"repo": "facebook/dinov3-vits16-pretrain-lvd1689m", "patch": 16, "size": "S"},
    "dinov3-vits16plus": {"repo": "facebook/dinov3-vits16plus-pretrain-lvd1689m", "patch": 16, "size": "S+"},
    "dinov3-vitb16": {"repo": "facebook/dinov3-vitb16-pretrain-lvd1689m", "patch": 16, "size": "B"},
    "dinov3-vitl16": {"repo": "facebook/dinov3-vitl16-pretrain-lvd1689m", "patch": 16, "size": "L"},
    "dinov2-small": {"repo": "facebook/dinov2-small", "patch": 14, "size": "S"},
    "dinov2-base": {"repo": "facebook/dinov2-base", "patch": 14, "size": "B"},
    "dinov2-large": {"repo": "facebook/dinov2-large", "patch": 14, "size": "L"},
    "dinov2reg-small": {"repo": "facebook/dinov2-with-registers-small", "patch": 14, "size": "S"},
    "dinov2reg-base": {"repo": "facebook/dinov2-with-registers-base", "patch": 14, "size": "B"},
    "clip-app": {"open_clip": ("ViT-B-32", "laion2b_s34b_b79k"), "size": "B"},
}
DEFAULT_MODELS = [
    "dinov3-vits16", "dinov3-vits16plus", "dinov3-vitb16",
    "dinov2-small", "dinov2-base", "dinov2reg-small", "dinov2reg-base", "clip-app",
]


# ── Tiền xử lý ────────────────────────────────────────────────────────────
def app_preprocess(image):
    """Giống backend `toDinoBuffer` (sharp): rotate EXIF → fit ≤512 → WebP q85."""
    from PIL import Image, ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((APP_MAX_EDGE, APP_MAX_EDGE), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=APP_WEBP_QUALITY)
    return Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")


def paper_size(width: int, height: int, patch: int, target: int = PAPER_SIZE) -> tuple[int, int]:
    """Cạnh lớn = target, giữ tỉ lệ; mỗi cạnh làm tròn về bội số patch (≥1 patch)."""
    scale = target / max(width, height)

    def snap(value: float) -> int:
        return max(patch, int(round(value * scale / patch)) * patch)

    return snap(width), snap(height)


def letterbox(image, target: int = PAPER_SIZE):
    """Resize cạnh lớn = target (giữ tỉ lệ) rồi đặt giữa nền đen target×target.

    Tương đương torchvision Resize(cạnh lớn) + CenterCrop(target): crop lớn hơn
    ảnh thì CenterCrop đệm 0 (đen) đều hai bên.
    """
    from PIL import Image

    width, height = image.size
    scale = target / max(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    resized = image.resize(size, Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (target, target))
    canvas.paste(resized, ((target - size[0]) // 2, (target - size[1]) // 2))
    return canvas


def load_image(path: Path, bbox=None):
    from PIL import Image, ImageFile

    # Revisited Paris có ảnh thiếu vài byte cuối (marker EOI) — dữ liệu ảnh vẫn
    # đủ; mặc định PIL từ chối mở → crash giữa chừng. Bench chấp nhận như toolkit.
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    image = Image.open(path).convert("RGB")
    if bbox is not None:
        x1, y1, x2, y2 = (int(round(v)) for v in bbox)
        image = image.crop((max(0, x1), max(0, y1), min(image.width, x2), min(image.height, y2)))
    return image


# ── Encoder ───────────────────────────────────────────────────────────────
def resolve_device(device: str) -> str:
    import torch

    if device != "auto":
        return device
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _sync(device: str) -> None:
    import torch

    if device == "mps":
        torch.mps.synchronize()
    elif device == "cuda":
        torch.cuda.synchronize()


class HFEncoder:
    """DINOv2/DINOv3 qua transformers — CLS token sau LayerNorm (pooler_output)."""

    def __init__(self, name: str, spec: dict, device: str) -> None:
        from transformers import AutoImageProcessor, AutoModel

        local = MODELS_DIR / spec["repo"].split("/")[-1]
        self.source = str(local) if (local / "config.json").exists() else spec["repo"]
        self.weights = local / "model.safetensors" if self.source == str(local) else None
        self.name, self.patch, self.device = name, spec["patch"], device
        self.processor = AutoImageProcessor.from_pretrained(self.source)
        self.model = AutoModel.from_pretrained(self.source).to(device).eval()
        self.dimension = int(self.model.config.hidden_size)
        self.params_m = round(sum(p.numel() for p in self.model.parameters()) / 1e6, 1)

    def to_tensor(self, image, preprocess: str):
        import torch
        from PIL import Image

        if preprocess == "app":
            image = app_preprocess(image)
        if preprocess in ("square224", "app"):  # đúng image processor mà provider app dùng
            return self.processor(images=image, return_tensors="pt")["pixel_values"][0]
        if preprocess == "pad224":
            image = letterbox(image)
        else:  # long224
            width, height = paper_size(image.width, image.height, self.patch)
            image = image.resize((width, height), Image.Resampling.BICUBIC)
        array = np.asarray(image, dtype=np.float32) / 255.0
        array = (array - IMAGENET_MEAN) / IMAGENET_STD
        return torch.from_numpy(array.transpose(2, 0, 1).astype(np.float32))

    def forward(self, batch):
        import torch

        with torch.inference_mode():
            features = self.model(pixel_values=batch.to(self.device)).pooler_output
            features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().numpy()


class ClipEncoder:
    """Baseline: provider CLIP của app (OpenCLIP preprocess: resize + center crop 224)."""

    def __init__(self, name: str, spec: dict, device: str) -> None:
        from app.providers.clip import OpenClipEmbeddingProvider

        model, pretrained = spec["open_clip"]
        self.provider = OpenClipEmbeddingProvider(model, pretrained, device)
        self.source, self.weights = f"open_clip:{model}/{pretrained}", None
        self.name, self.patch, self.device = name, 32, self.provider._device
        self.dimension = self.provider.dimension
        self.params_m = round(sum(p.numel() for p in self.provider._model.visual.parameters()) / 1e6, 1)

    def to_tensor(self, image, preprocess: str):
        if preprocess == "app":
            image = app_preprocess(image)
        return self.provider._preprocess(image)

    def forward(self, batch):
        import torch

        with torch.inference_mode():
            features = self.provider._model.encode_image(batch.to(self.device))
            features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().numpy()


def build_encoder(name: str, device: str):
    if name not in MODELS:
        raise SystemExit(f"Model không hỗ trợ: {name!r}. Chọn: {', '.join(MODELS)}")
    spec = MODELS[name]
    cls = ClipEncoder if "open_clip" in spec else HFEncoder
    try:
        return cls(name, spec, device)
    except OSError as exc:  # gated / chưa login / chưa tải
        raise SystemExit(
            f"Không load được {name} ({spec.get('repo', '')}): {exc}\n"
            "→ Chấp nhận license trên trang model HF rồi `uv run hf auth login` (xem bench/README.md)."
        ) from exc


def encode(encoder, items: list[tuple[Path, object]], preprocess: str, batch_size: int, workers: int):
    """items = [(path, bbox|None)] → (N, D). Gom ảnh cùng kích thước tensor thành batch."""
    import torch

    def prepare(item):
        path, bbox = item
        return encoder.to_tensor(load_image(path, bbox), preprocess)

    out = np.zeros((len(items), encoder.dimension), dtype=np.float32)
    chunk = max(batch_size * 8, 256)
    model_s = 0.0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(items), chunk):
            tensors = list(pool.map(prepare, items[start : start + chunk]))
            buckets: dict[tuple, list[int]] = {}
            for i, tensor in enumerate(tensors):
                buckets.setdefault(tuple(tensor.shape), []).append(i)
            for indices in buckets.values():
                for b in range(0, len(indices), batch_size):
                    idx = indices[b : b + batch_size]
                    t0 = time.perf_counter()
                    out[[start + i for i in idx]] = encoder.forward(torch.stack([tensors[i] for i in idx]))
                    model_s += time.perf_counter() - t0
            print(f"\r    {min(start + chunk, len(items))}/{len(items)}", end="", flush=True)
    print(flush=True)
    return out, model_s


def batch1_latency(encoder, paths: list[Path], preprocess: str, warmup: int = 10) -> dict[str, float]:
    """Latency 1 ảnh (như lúc upload): wall = load + preprocess + forward; model = forward."""
    tensors = [encoder.to_tensor(load_image(p), preprocess) for p in paths[:warmup]]
    for tensor in tensors:
        encoder.forward(tensor[None])
    _sync(encoder.device)
    wall, model = [], []
    for path in paths[warmup:]:
        t0 = time.perf_counter()
        tensor = encoder.to_tensor(load_image(path), preprocess)
        t1 = time.perf_counter()
        encoder.forward(tensor[None])  # .cpu() trong forward đã đồng bộ device
        t2 = time.perf_counter()
        wall.append((t2 - t0) * 1000)
        model.append((t2 - t1) * 1000)
    return {
        "latency_model_ms": round(float(np.mean(model)), 2),
        "latency_model_p95_ms": round(float(np.percentile(model, 95)), 2),
        "latency_wall_ms": round(float(np.mean(wall)), 2),
    }


# ── Runner ────────────────────────────────────────────────────────────────
def run_dataset(encoder, data, args, base_row: dict) -> None:
    dataset = data.name
    gnd = data.gnd[: args.limit_queries] if args.limit_queries else data.gnd
    qnames = data.qimlist[: len(gnd)]
    db_items = [(data.image_path(n), None) for n in data.imlist]
    published = DINO_RETRIEVAL.get(encoder.name, {}).get(dataset, {})

    for preprocess in args.preprocess:
        label = "openclip" if isinstance(encoder, ClipEncoder) and preprocess != "app" else preprocess
        print(f"  [{dataset}] {len(db_items)} ảnh database · {len(gnd)} query · {label}", flush=True)
        t0 = time.perf_counter()
        db, db_model_s = encode(encoder, db_items, preprocess, args.batch_size, args.workers)
        db_s = time.perf_counter() - t0
        latency = (
            batch1_latency(encoder, [p for p, _ in db_items[: args.latency_images + 10]], preprocess)
            if args.latency_images
            else {}
        )
        for crop in args.query_crop:
            q_items = [
                (data.image_path(n), entry["bbx"] if crop == "bbox" else None)
                for n, entry in zip(qnames, gnd)
            ]
            queries, _ = encode(encoder, q_items, preprocess, args.batch_size, args.workers)
            metrics = evaluate(queries @ db.T, gnd)
            comparable = (
                bool(published) and preprocess == "pad224" and not args.limit_queries
            )
            row = {
                **base_row,
                "timestamp": utc_now(),
                "dataset": dataset,
                "preprocess": label,
                "query_crop": crop,
                "images": len(db_items),
                "queries": len(gnd),
                **metrics,
                "published_mAP_H": published.get("mAP_H", ""),
                "delta_mAP_H": round(metrics["mAP_H"] - published["mAP_H"], 2) if comparable else "",
                "published_source": DINO_SOURCE if published else "",
                "db_encode_s": round(db_s, 1),
                "db_model_s": round(db_model_s, 1),
                "img_per_s": round(len(db_items) / db_s, 1),
                **latency,
            }
            append_csv(args.csv, row)
            print(
                f"  → crop={crop}: mAP E/M/H = {metrics['mAP_E']}/{metrics['mAP_M']}/{metrics['mAP_H']}"
                + (f" (paper H {published['mAP_H']})" if published else ""),
                flush=True,
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="DINOv3 instance retrieval (Revisited Oxford/Paris).")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS, choices=list(MODELS))
    parser.add_argument("--datasets", nargs="+", default=list(DATASETS), choices=list(DATASETS))
    parser.add_argument(
        "--preprocess", nargs="+", default=["pad224"], choices=["pad224", "long224", "square224", "app"]
    )
    parser.add_argument("--query-crop", nargs="+", default=["bbox"], choices=["bbox", "full"])
    parser.add_argument("--device", default="auto", help="auto | mps | cpu")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=8, help="Thread đọc + resize ảnh.")
    parser.add_argument("--latency-images", type=int, default=100, help="Số ảnh đo latency batch 1 (0 = bỏ).")
    parser.add_argument("--limit-queries", type=int, default=None, help="Chỉ N query đầu (smoke test).")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=RESULTS_CSV)
    args = parser.parse_args()

    if args.limit_queries:  # smoke test không lẫn vào kết quả chính thức
        args.csv = args.csv.with_name(args.csv.stem + "_smoke.csv")

    import transformers

    # Kiểm tra mọi dataset TRƯỚC khi load model — thiếu ảnh thì dừng ngay,
    # không để chạy xong model đầu rồi mới báo lỗi ở dataset sau.
    datasets = [load_revisitop(args.data_root, name) for name in args.datasets]

    device = resolve_device(args.device)
    for name in args.models:
        print(f"\n=== {name} ===", flush=True)
        loaded = time.perf_counter()
        encoder = build_encoder(name, device)
        base_row = {
            "model": name,
            "source": encoder.source,
            "size": MODELS[name]["size"],
            "params_m": encoder.params_m,
            "dimension": encoder.dimension,
            "patch": encoder.patch,
            "device": encoder.device,
            "batch_size": args.batch_size,
            "load_s": round(time.perf_counter() - loaded, 1),
            "weights_sha256": sha256_of(encoder.weights) if encoder.weights and encoder.weights.exists() else "",
            **environment_info(),
            "transformers": transformers.__version__,
        }
        preprocess = list(args.preprocess)
        if isinstance(encoder, ClipEncoder):  # pad/long/square224 không áp dụng cho OpenCLIP
            preprocess = ["pad224"] + (["app"] if "app" in preprocess else [])
        run_args = argparse.Namespace(**{**vars(args), "preprocess": preprocess})
        for data in datasets:
            run_dataset(encoder, data, run_args, base_row)
        del encoder
    print(f"\n→ {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
