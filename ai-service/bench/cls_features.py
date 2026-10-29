"""Trích feature cho classification bằng ĐÚNG provider của app, có cache.

Ba loại feature (app đã tính sẵn lúc upload → classification gần như miễn phí):
    clip   (512)  OpenCLIP ViT-B-32 / laion2b — cùng vector semantic search
                  (BENCH_CLIP=<model>:<pretrained> để thử CLIP khác, vd đa ngôn ngữ)
    dino   (384)  DINOv3 ViT-S/16 — cùng vector "Ảnh tương tự"
    yolo   (240)  YOLO26n: 80 class COCO × [log(1+số lượng), conf lớn nhất, diện tích lớn nhất]

`--image-preprocess backend` (mặc định) giả lập backend: CLIP/DINO nhận WebP cạnh
≤512, YOLO nhận JPEG cạnh ≤1280 (pipeline/folder.py::reencode).

Cache: $TNG_DATASETS/cls_cache/<dataset>/<feature>-<preprocess>.npz (CLIP khác mặc
định: clip@<model>-<preprocess>.npz), kèm danh sách
file → dataset đổi thì tự tính lại. Xoá thư mục cache để ép tính lại.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from bench.common import MODELS_DIR, utc_now

FEATURES = ("clip", "dino", "yolo")
DEFAULT_CLIP = ("ViT-B-32", "laion2b_s34b_b79k")  # = AI_CLIP_MODEL / AI_CLIP_PRETRAINED mặc định


def _clip_from_env() -> tuple[str, str]:
    """`BENCH_CLIP=<model>:<pretrained>` chọn CLIP khác (vd CLIP đa ngôn ngữ
    `xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k`); bỏ trống → CLIP mặc định."""
    spec = os.environ.get("BENCH_CLIP", "").strip()
    if not spec:
        return DEFAULT_CLIP
    name, _, pretrained = spec.partition(":")
    if not pretrained:
        raise SystemExit("BENCH_CLIP phải có dạng <model>:<pretrained>")
    return name, pretrained


CLIP_MODEL = _clip_from_env()
# CLIP khác mặc định → cache / model / CSV tách riêng theo tên model (= tên
# provider.model mà ai-service ghi vào DB), không ghi đè kết quả CLIP mặc định.
CLIP_TAG = "" if CLIP_MODEL == DEFAULT_CLIP else CLIP_MODEL[0]


def feature_stem(kind: str, preprocess: str) -> str:
    """Tên file cache: clip-backend / clip@<model>-backend / dino-backend …"""
    if kind == "clip" and CLIP_TAG:
        return f"clip@{CLIP_TAG}-{preprocess}"
    return f"{kind}-{preprocess}"
DINO_MODEL = "dinov3-vits16-pretrain-lvd1689m"  # = AI_DINO_MODEL
YOLO_WEIGHTS = "yolo26n.pt"                      # = AI_YOLO_WEIGHTS
YOLO_CONF, YOLO_IMGSZ = 0.25, 640                # = AI_YOLO_CONF / AI_YOLO_IMGSZ


def cache_dir(data_root: Path, dataset: str) -> Path:
    return data_root.expanduser().resolve() / "cls_cache" / dataset


# ── Providers (load lười, dùng chung trong 1 lần chạy) ────────────────────
_providers: dict[str, object] = {}


def provider(kind: str, device: str = "auto"):
    if kind in _providers:
        return _providers[kind]
    if kind == "clip":
        from app.providers.clip import OpenClipEmbeddingProvider

        _providers[kind] = OpenClipEmbeddingProvider(*CLIP_MODEL, device)
    elif kind == "dino":
        from app.providers.dinov3 import Dinov3SimilarityProvider

        path = MODELS_DIR / DINO_MODEL
        if not (path / "config.json").exists():
            raise SystemExit(f"Thiếu {path} — tải bằng scripts/download_dino_weight.py.")
        _providers[kind] = Dinov3SimilarityProvider(str(path), device)
    elif kind == "yolo":
        from app.providers.yolo import YoloObjectDetectionProvider

        _providers[kind] = YoloObjectDetectionProvider(
            str(MODELS_DIR / YOLO_WEIGHTS), device, YOLO_CONF, YOLO_IMGSZ
        )
    else:
        raise ValueError(kind)
    return _providers[kind]


def yolo_class_names(device: str = "auto") -> list[str]:
    names = provider("yolo", device)._model.names
    return [names[i] for i in sorted(names)]


# ── Tiền xử lý ────────────────────────────────────────────────────────────
def _prepare(path: Path, kind: str, preprocess: str) -> bytes:
    data = path.read_bytes()
    if preprocess == "raw":
        return data
    from pipeline.folder import reencode

    if kind == "yolo":
        return reencode(data, 1280, "JPEG", 85)  # detection.service.js
    return reencode(data, 512, "WEBP", 85 if kind == "dino" else 80)  # similarity / embedding


def yolo_vector(detections: list[dict], names: list[str]) -> np.ndarray:
    """80 class × [log1p(count), max conf, max diện tích bbox] → (240,)."""
    index = {n: i for i, n in enumerate(names)}
    count = np.zeros(len(names), dtype=np.float32)
    conf = np.zeros(len(names), dtype=np.float32)
    area = np.zeros(len(names), dtype=np.float32)
    for det in detections:
        i = index.get(det["class_name"])
        if i is None:
            continue
        x1, y1, x2, y2 = det["bbox"]
        count[i] += 1
        conf[i] = max(conf[i], det["confidence"])
        area[i] = max(area[i], max(0.0, x2 - x1) * max(0.0, y2 - y1))
    return np.concatenate([np.log1p(count), conf, area])


# ── Trích + cache ─────────────────────────────────────────────────────────
def extract(kind: str, paths: list[Path], preprocess: str, device: str, batch_size: int,
            workers: int) -> tuple[np.ndarray, list[list[dict]] | None, float]:
    """→ (X, detections thô nếu yolo, giây model)."""
    model = provider(kind, device)
    names = yolo_class_names(device) if kind == "yolo" else None
    rows, raw, model_s = [], [] if kind == "yolo" else None, 0.0
    chunk = max(batch_size * 4, 128)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(paths), chunk):
            blobs = list(pool.map(lambda p: _prepare(p, kind, preprocess), paths[start:start + chunk]))
            t0 = time.perf_counter()
            if kind == "yolo":
                for blob in blobs:
                    dets = model.detect(blob)
                    raw.append(dets)
                    rows.append(yolo_vector(dets, names))
            else:
                for b in range(0, len(blobs), batch_size):
                    rows.extend(model.encode_images(blobs[b:b + batch_size]))
            model_s += time.perf_counter() - t0
            print(f"\r    {kind}: {min(start + chunk, len(paths))}/{len(paths)}", end="", flush=True)
    print(flush=True)
    return np.asarray(rows, dtype=np.float32), raw, model_s


def load_features(dataset, kind: str, data_root: Path, preprocess: str = "backend",
                  device: str = "auto", batch_size: int = 64, workers: int = 8) -> np.ndarray:
    """Feature (N, D) của `dataset` theo đúng thứ tự `dataset.files` (dùng cache nếu khớp)."""
    out = cache_dir(data_root, dataset.name) / f"{feature_stem(kind, preprocess)}.npz"
    if out.exists():
        cached = np.load(out, allow_pickle=False)
        cached_files = list(cached["files"])
        if cached_files == dataset.files:
            return cached["X"]
        position = {f: i for i, f in enumerate(cached_files)}
        if all(f in position for f in dataset.files):  # tập con (vd ảnh đã duyệt) → dùng lại
            return cached["X"][[position[f] for f in dataset.files]]
        print(f"  ! cache {out.name} không khớp danh sách ảnh — tính lại", flush=True)
    print(f"  [{dataset.name}] trích {kind} cho {len(dataset.files)} ảnh ({preprocess})…", flush=True)
    t0 = time.perf_counter()
    X, raw, model_s = extract(kind, dataset.paths(), preprocess, device, batch_size, workers)
    meta = {
        "kind": kind, "preprocess": preprocess, "created": utc_now(),
        "seconds_total": round(time.perf_counter() - t0, 1), "seconds_model": round(model_s, 1),
        "model": {"clip": "/".join(CLIP_MODEL), "dino": DINO_MODEL, "yolo": YOLO_WEIGHTS}[kind],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez(out, X=X, files=np.array(dataset.files), meta=json.dumps(meta))
    if raw is not None:  # giữ detection thô — pre-label/UI cần box
        (out.parent / f"yolo-{preprocess}-detections.json").write_text(
            json.dumps(dict(zip(dataset.files, raw)))
        )
    return X


def feature_meta(dataset_name: str, kind: str, data_root: Path, preprocess: str = "backend") -> dict:
    path = cache_dir(data_root, dataset_name) / f"{feature_stem(kind, preprocess)}.npz"
    if not path.exists():
        return {}
    return json.loads(str(np.load(path, allow_pickle=False)["meta"]))
