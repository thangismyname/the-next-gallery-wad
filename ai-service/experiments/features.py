"""Feature ảnh (CLIP / DINOv3 embedding, YOLO detection) bằng ĐÚNG provider của app, có cache.

Tiền xử lý `backend` (mặc định) giống backend lúc upload:
  CLIP ← EXIF rotate → cạnh ≤512 → WebP q80   (embedding.service.js)
  DINO ← EXIF rotate → cạnh ≤512 → WebP q85   (similarity.service.js)
  YOLO ← EXIF rotate → cạnh ≤1280 → JPEG q85  (detection.service.js)
`raw` = đưa file gốc vào provider.

Cache: $TNG_DATASETS/Results/cache/oi/<dataset>/clip@<model>@<pretrained>-<pre>.npz
       $TNG_DATASETS/Results/cache/oi/<dataset>/dino@<model>-<pre>.npz
       $TNG_DATASETS/Results/cache/oi/<dataset>/yolo@<weights>-c<conf>-<pre>.json
Run smoke dùng lại cache của run đầy đủ (lấy tập con theo image id).
"""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from bench.common import MODELS_DIR
from experiments.core import cache_root

APP_CLIP = "ViT-B-32:laion2b_s34b_b79k"       # = AI_CLIP_MODEL:AI_CLIP_PRETRAINED
MULTILINGUAL_CLIP = "xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k"
APP_YOLO = "yolo26n.pt"                        # = AI_YOLO_WEIGHTS
APP_DINO = "dinov3-vits16-pretrain-lvd1689m"   # = AI_DINO_MODEL (models/<tên>, gated HF)
YOLO_APP_CONF = 0.25                           # = AI_YOLO_CONF (đếm / diện tích chỉ tính box ≥ ngưỡng này)
GENERIC_PROMPTS = ["a photo.", "a random everyday photo.", "a photo of something."]  # = app/tagging/taxonomy.py

_providers: dict[str, object] = {}


def parse_clip(spec: str) -> tuple[str, str]:
    model, _, pretrained = spec.partition(":")
    if not pretrained:
        raise SystemExit(f"CLIP phải có dạng MODEL:PRETRAINED (nhận {spec!r})")
    return model, pretrained


def clip_provider(spec: str, device: str = "auto"):
    key = f"clip|{spec}|{device}"
    if key not in _providers:
        from app.providers.clip import OpenClipEmbeddingProvider

        _providers[key] = OpenClipEmbeddingProvider(*parse_clip(spec), device)
    return _providers[key]


def yolo_provider(weights: str, conf: float, imgsz: int, device: str = "auto"):
    key = f"yolo|{weights}|{conf}|{imgsz}|{device}"
    if key not in _providers:
        from app.providers.yolo import YoloObjectDetectionProvider

        path = MODELS_DIR / weights
        _providers[key] = YoloObjectDetectionProvider(str(path) if path.exists() else weights,
                                                      device, conf, imgsz)
    return _providers[key]


def dino_provider(model: str = APP_DINO, device: str = "auto"):
    key = f"dino|{model}|{device}"
    if key not in _providers:
        from app.providers.dinov3 import Dinov3SimilarityProvider

        path = MODELS_DIR / model
        if not (path / "config.json").exists():
            raise SystemExit(f"Thiếu {path} — tải bằng scripts/download_dino_weight.py (weights gated trên HF).")
        _providers[key] = Dinov3SimilarityProvider(str(path), device)
    return _providers[key]


def prepare_bytes(path: Path, kind: str, preprocess: str) -> bytes:
    data = path.read_bytes()
    if preprocess == "raw":
        return data
    from pipeline.folder import reencode

    if kind == "yolo":
        return reencode(data, 1280, "JPEG", 85)
    return reencode(data, 512, "WEBP", 85 if kind == "dino" else 80)


def _safe(s: str) -> str:
    return s.replace("/", "_").replace(":", "@")


def _subset_rows(cached_ids: list[str], wanted: list[str]):
    pos = {i: k for k, i in enumerate(cached_ids)}
    if all(i in pos for i in wanted):
        return [pos[i] for i in wanted]
    return None


# ── CLIP ──────────────────────────────────────────────────────────────────
def clip_image_features(dataset_name: str, ids: list[str], paths: list[Path], data_root: Path,
                        spec: str = APP_CLIP, preprocess: str = "backend", device: str = "auto",
                        batch_size: int = 64, workers: int = 8, run=None) -> np.ndarray:
    """(N, D) L2-normalized, đúng thứ tự `ids`."""
    out = cache_root(data_root) / dataset_name / f"clip@{_safe(spec)}-{preprocess}.npz"
    return _embed_cached(out, "clip", spec, lambda: clip_provider(spec, device), dataset_name, ids, paths,
                         preprocess, batch_size, workers, run)


def dino_image_features(dataset_name: str, ids: list[str], paths: list[Path], data_root: Path,
                        model: str = APP_DINO, preprocess: str = "backend", device: str = "auto",
                        batch_size: int = 32, workers: int = 8, run=None) -> np.ndarray:
    """(N, 384) DINOv3 L2-normalized (= vector "Ảnh tương tự" của app), đúng thứ tự `ids`."""
    out = cache_root(data_root) / dataset_name / f"dino@{_safe(model)}-{preprocess}.npz"
    return _embed_cached(out, "dino", model, lambda: dino_provider(model, device), dataset_name, ids, paths,
                         preprocess, batch_size, workers, run)


def _embed_cached(out: Path, kind: str, spec: str, get_model, dataset_name: str, ids: list[str],
                  paths: list[Path], preprocess: str, batch_size: int, workers: int, run) -> np.ndarray:
    if out.exists():
        cached = np.load(out, allow_pickle=False)
        rows = _subset_rows([str(i) for i in cached["ids"]], ids)
        if rows is not None:
            return cached["X"][rows]
        if run:
            run.log(f"  ! cache {out.name} thiếu ảnh — tính lại")
    model = get_model()
    chunks, t_model = [], 0.0
    t0 = time.perf_counter()
    step = max(batch_size * 4, 128)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(paths), step):
            blobs = list(pool.map(lambda p: prepare_bytes(p, kind, preprocess), paths[start:start + step]))
            t1 = time.perf_counter()
            for b in range(0, len(blobs), batch_size):
                chunks.append(model.encode_images(blobs[b:b + batch_size]))
            t_model += time.perf_counter() - t1
            if run:
                run.progress(min(start + step, len(paths)), len(paths), f"{kind.upper()} {dataset_name}")
    X = np.concatenate(chunks).astype(np.float32) if chunks else np.zeros((0, model.dimension), np.float32)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez(out, X=X, ids=np.array(ids), meta=json.dumps({
        "spec": spec, "preprocess": preprocess, "seconds_total": round(time.perf_counter() - t0, 1),
        "seconds_model": round(t_model, 1)}))
    return X


def encode_texts(spec: str, texts: list[str], device: str = "auto", batch_size: int = 256) -> np.ndarray:
    model = clip_provider(spec, device)
    if not texts:
        return np.zeros((0, model.dimension), np.float32)
    return np.concatenate([model.encode_texts(texts[i:i + batch_size])
                           for i in range(0, len(texts), batch_size)]).astype(np.float32)


def prompt_embeddings(spec: str, names: list[str], templates: list[str], device: str = "auto") -> np.ndarray:
    """(C, D): trung bình embedding các template của mỗi lớp (prompt ensembling), chuẩn hoá lại."""
    texts = [t.replace("{}", n) if "{}" in t else f"{t} {n}" for n in names for t in templates]
    E = encode_texts(spec, texts, device).reshape(len(names), len(templates), -1).mean(axis=1)
    return E / np.linalg.norm(E, axis=1, keepdims=True)


def generic_embedding(spec: str, device: str = "auto") -> np.ndarray:
    g = encode_texts(spec, GENERIC_PROMPTS, device).mean(axis=0)
    return g / np.linalg.norm(g)


def logit_scale(spec: str, device: str = "auto") -> float:
    return float(clip_provider(spec, device).logit_scale)


# ── YOLO ──────────────────────────────────────────────────────────────────
def yolo_detections(dataset_name: str, ids: list[str], paths: list[Path], data_root: Path,
                    weights: str = APP_YOLO, conf: float = 0.001, imgsz: int = 640,
                    preprocess: str = "backend", device: str = "auto", workers: int = 8,
                    run=None) -> dict[str, list[dict]]:
    """id → [{class_name, confidence, bbox 0–1}] (conf thấp để tính mAP; app lọc 0.25 sau)."""
    out = cache_root(data_root) / dataset_name / f"yolo@{_safe(weights)}-c{conf}-i{imgsz}-{preprocess}.json"
    if out.exists():
        cached = json.loads(out.read_text())
        if all(i in cached for i in ids):
            return {i: cached[i] for i in ids}
        if run:
            run.log(f"  ! cache {out.name} thiếu ảnh — tính lại")
    model = yolo_provider(weights, conf, imgsz, device)
    result: dict[str, list[dict]] = {}
    step = 64
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(paths), step):
            blobs = list(pool.map(lambda p: prepare_bytes(p, "yolo", preprocess), paths[start:start + step]))
            for i, blob in zip(ids[start:start + step], blobs):
                result[i] = model.detect(blob)
            if run:
                run.progress(min(start + step, len(paths)), len(paths), f"YOLO {dataset_name}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result))
    return result


def yolo_names(weights: str = APP_YOLO, device: str = "auto") -> list[str]:
    """80 tên lớp COCO theo thứ tự của model."""
    names = yolo_provider(weights, YOLO_APP_CONF, 640, device)._model.names
    return [names[i] for i in sorted(names)]


def yolo_feature_matrix(dets: dict[str, list[dict]], ids: list[str], names: list[str],
                        count_conf: float = YOLO_APP_CONF) -> np.ndarray:
    """(N, 3·K): mỗi lớp COCO [log1p(số box ≥ count_conf), conf lớn nhất, diện tích box lớn nhất ≥ count_conf]
    — cùng ý với bench/cls_features.yolo_vector, nhưng detection ở conf thấp (cache E4) nên đếm có ngưỡng."""
    index = {n: k for k, n in enumerate(names)}
    K = len(names)
    F = np.zeros((len(ids), 3 * K), dtype=np.float32)
    for i, img in enumerate(ids):
        for d in dets.get(img, []):
            k = index.get(d["class_name"])
            if k is None:
                continue
            F[i, K + k] = max(F[i, K + k], d["confidence"])
            if d["confidence"] >= count_conf:
                x1, y1, x2, y2 = d["bbox"]
                F[i, k] += 1
                F[i, 2 * K + k] = max(F[i, 2 * K + k], max(0.0, x2 - x1) * max(0.0, y2 - y1))
    F[:, :K] = np.log1p(F[:, :K])
    return F
