"""Tái lập kết quả CLIP (Radford et al., 2021) bằng CHÍNH provider của ai-service.

Hai loại thí nghiệm (giống CLIP_benchmark / paper):

1. Zero-shot retrieval (paper Table 13) — COCO 5k test, Flickr30k 1k test.
   text→image R@K: với mỗi caption, ảnh đúng có nằm trong top-K ảnh không.
   image→text R@K: với mỗi ảnh, có caption đúng nào nằm trong top-K caption không.
   Ablation `--caption-prefix`: paper thêm "a photo of" trước caption (+1–2 R@1).

2. Zero-shot classification (paper Table 11) — CIFAR-10/100 (+ ImageNetV2).
   Mỗi lớp → nhiều câu prompt → trung bình embedding → bộ phân loại; ảnh được
   gán lớp có cosine cao nhất. Ablation `--prompts`:
     ensemble  — toàn bộ prompt của dataset (CIFAR: 18, ImageNet: 80) — như paper
     single    — 1 prompt "a photo of a {c}."
     classname — chỉ tên lớp (baseline "không prompt" của paper)

`--image-preprocess backend` giả lập đúng đường đi ảnh của app (sharp: xoay EXIF,
thu về cạnh ≤512 px, WebP quality 80) trước khi đưa vào provider — dùng cho
Bước 3 (đo mức ảnh hưởng của pipeline app so với ảnh gốc).

Usage (từ ai-service/, dataset theo bench/README.md):
    uv run python -m bench.clip_eval                                      # 5 model × 4 dataset
    uv run python -m bench.clip_eval --models ViT-B-32:openai --datasets cifar10 --limit 500   # smoke
    uv run python -m bench.clip_eval --models ViT-B-32:openai --datasets cifar10 cifar100 \\
        --prompts ensemble single classname                               # ablation prompt
    uv run python -m bench.clip_eval --models ViT-B-32:openai --datasets mscoco_captions \\
        --caption-prefix none "a photo of" --image-preprocess raw backend # ablation app
"""
from __future__ import annotations

import argparse
import io
import time
from pathlib import Path

import numpy as np

from bench.clip_data import DATASETS, load_classification, load_retrieval
from bench.common import (
    DEFAULT_DATA_ROOT,
    RESULTS_DIR,
    append_csv,
    environment_info,
    utc_now,
)
from bench.published import (
    CLIP_RETRIEVAL,
    CLIP_SOURCE_RETRIEVAL,
    CLIP_SOURCE_ZEROSHOT,
    CLIP_ZEROSHOT,
)

RETRIEVAL_CSV = RESULTS_DIR / "clip_retrieval.csv"
ZEROSHOT_CSV = RESULTS_DIR / "clip_zeroshot.csv"
DEFAULT_MODELS = [
    "ViT-B-32:openai",
    "ViT-B-16:openai",
    "ViT-L-14:openai",
    "ViT-L-14-336:openai",
    "ViT-B-32:laion2b_s34b_b79k",  # model app đang dùng
]
RECALL_KS = (1, 5, 10)
SINGLE_PROMPT = "a photo of a {c}."


# ── Tiền xử lý ảnh ────────────────────────────────────────────────────────
def backend_preprocess(image_bytes: bytes) -> bytes:
    """Giống backend `toEmbedBuffer` (sharp): rotate EXIF → fit ≤512 → WebP q80."""
    from PIL import Image, ImageOps

    image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)  # inside, không phóng to
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=80)
    return buffer.getvalue()


def encode_images(provider, images: list[bytes], batch_size: int, preprocess: str) -> tuple[np.ndarray, float]:
    started = time.perf_counter()
    chunks = []
    for start in range(0, len(images), batch_size):
        batch = images[start : start + batch_size]
        if preprocess == "backend":
            batch = [backend_preprocess(b) for b in batch]
        chunks.append(provider.encode_images(batch))
        done = min(start + batch_size, len(images))
        print(f"\r  ảnh {done}/{len(images)}", end="", flush=True)
    print(flush=True)
    return np.concatenate(chunks), time.perf_counter() - started


def encode_texts(provider, texts: list[str], batch_size: int) -> tuple[np.ndarray, float]:
    started = time.perf_counter()
    chunks = [
        provider.encode_texts(texts[start : start + batch_size])
        for start in range(0, len(texts), batch_size)
    ]
    return np.concatenate(chunks), time.perf_counter() - started


# ── Metric ────────────────────────────────────────────────────────────────
def _topk_indices(scores: np.ndarray, k: int) -> np.ndarray:
    k = min(k, scores.shape[1])
    return np.argpartition(-scores, k - 1, axis=1)[:, :k]


def retrieval_recalls(
    image_emb: np.ndarray, text_emb: np.ndarray, caption_to_image: np.ndarray, chunk: int = 1024
) -> dict[str, float]:
    """R@K hai chiều (%), cùng định nghĩa với CLIP_benchmark."""
    max_k = max(RECALL_KS)
    t2i_hits = {k: 0 for k in RECALL_KS}
    for start in range(0, len(text_emb), chunk):
        scores = text_emb[start : start + chunk] @ image_emb.T
        order = np.argsort(-scores, axis=1)[:, :max_k]
        target = caption_to_image[start : start + chunk, None]
        for k in RECALL_KS:
            t2i_hits[k] += int((order[:, :k] == target).any(axis=1).sum())

    i2t_hits = {k: 0 for k in RECALL_KS}
    for start in range(0, len(image_emb), chunk):
        scores = image_emb[start : start + chunk] @ text_emb.T
        order = np.argsort(-scores, axis=1)[:, :max_k]
        owner = caption_to_image[order]  # ảnh sở hữu từng caption trong top-K
        target = np.arange(start, start + len(scores))[:, None]
        for k in RECALL_KS:
            i2t_hits[k] += int((owner[:, :k] == target).any(axis=1).sum())

    result = {}
    for k in RECALL_KS:
        result[f"t2i_R@{k}"] = round(100 * t2i_hits[k] / len(text_emb), 2)
    for k in RECALL_KS:
        result[f"i2t_R@{k}"] = round(100 * i2t_hits[k] / len(image_emb), 2)
    return result


def zeroshot_classifier(provider, classnames: list[str], templates: list[str], batch_size: int) -> np.ndarray:
    """(n_classes, D): trung bình embedding các prompt của mỗi lớp, chuẩn hoá lại."""
    weights = []
    for classname in classnames:
        prompts = [t.replace("{c}", classname) for t in templates]
        embeddings, _ = encode_texts(provider, prompts, batch_size)
        mean = embeddings.mean(axis=0)
        weights.append(mean / (np.linalg.norm(mean) or 1.0))
    return np.stack(weights)


def topk_accuracy(image_emb: np.ndarray, classifier: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    logits = image_emb @ classifier.T
    top5 = _topk_indices(logits, 5)
    top1 = logits.argmax(axis=1)
    return {
        "top1": round(100 * float((top1 == labels).mean()), 2),
        "top5": round(100 * float((top5 == labels[:, None]).any(axis=1).mean()), 2),
    }


def prompt_templates(mode: str, dataset_templates: list[str]) -> list[str]:
    if mode == "ensemble":
        return dataset_templates
    if mode == "single":
        return [SINGLE_PROMPT]
    return ["{c}"]  # classname


# ── Runner ────────────────────────────────────────────────────────────────
def parse_model(spec: str) -> tuple[str, str]:
    model, _, pretrained = spec.partition(":")
    if not pretrained:
        raise SystemExit(f"Model phải có dạng TÊN:PRETRAINED, vd ViT-B-32:openai (nhận {spec!r})")
    return model, pretrained


def run_retrieval(provider, model_key, dataset, args, base_row) -> None:
    data = load_retrieval(args.data_root, dataset, args.limit)
    caption_to_image = np.asarray(data.caption_to_image)
    reference = CLIP_RETRIEVAL.get(model_key, {}).get(dataset)
    for preprocess in args.image_preprocess:
        print(f"  [{dataset}] {len(data.images)} ảnh · {len(data.captions)} caption · {preprocess}", flush=True)
        image_emb, image_s = encode_images(provider, data.images, args.batch_size, preprocess)
        for prefix in args.caption_prefix:
            texts = data.captions if prefix == "none" else [f"{prefix} {c}" for c in data.captions]
            text_emb, text_s = encode_texts(provider, texts, args.batch_size)
            recalls = retrieval_recalls(image_emb, text_emb, caption_to_image)
            row = {
                **base_row,
                "timestamp": utc_now(),
                "dataset": dataset,
                "caption_prefix": prefix,
                "image_preprocess": preprocess,
                "images": len(data.images),
                "captions": len(data.captions),
                **recalls,
            }
            for direction in ("text_to_image", "image_to_text"):
                short = "t2i" if direction == "text_to_image" else "i2t"
                for k in RECALL_KS:
                    published = (reference or {}).get(direction, {}).get(f"R@{k}")
                    row[f"published_{short}_R@{k}"] = published if published is not None else ""
            row["delta_t2i_R@1"] = (
                round(row["t2i_R@1"] - row["published_t2i_R@1"], 2) if reference and not args.limit else ""
            )
            row["delta_i2t_R@1"] = (
                round(row["i2t_R@1"] - row["published_i2t_R@1"], 2) if reference and not args.limit else ""
            )
            row["published_source"] = CLIP_SOURCE_RETRIEVAL if reference else ""
            row["image_encode_s"] = round(image_s, 1)
            row["text_encode_s"] = round(text_s, 1)
            append_csv(args.retrieval_csv, row)
            print(
                f"  → prefix={prefix!r}: t2i R@1/5/10 = {recalls['t2i_R@1']}/{recalls['t2i_R@5']}/"
                f"{recalls['t2i_R@10']} · i2t R@1/5/10 = {recalls['i2t_R@1']}/{recalls['i2t_R@5']}/"
                f"{recalls['i2t_R@10']}",
                flush=True,
            )


def run_zeroshot(provider, model_key, dataset, args, base_row) -> None:
    data = load_classification(args.data_root, dataset, args.limit)
    labels = np.asarray(data.labels)
    published = CLIP_ZEROSHOT.get(model_key, {}).get(dataset)
    for preprocess in args.image_preprocess:
        print(f"  [{dataset}] {len(data.images)} ảnh · {len(data.classnames)} lớp · {preprocess}", flush=True)
        image_emb, image_s = encode_images(provider, data.images, args.batch_size, preprocess)
        for mode in args.prompts:
            templates = prompt_templates(mode, data.templates)
            classifier = zeroshot_classifier(provider, data.classnames, templates, args.batch_size)
            accuracy = topk_accuracy(image_emb, classifier, labels)
            # Paper dùng prompt ensembling → chỉ so độ lệch ở mode ensemble, full test set.
            comparable = published is not None and mode == "ensemble" and not args.limit
            row = {
                **base_row,
                "timestamp": utc_now(),
                "dataset": dataset,
                "prompts": mode,
                "n_templates": len(templates),
                "image_preprocess": preprocess,
                "images": len(data.images),
                "classes": len(data.classnames),
                **accuracy,
                "published_top1": published if published is not None else "",
                "delta_top1": round(accuracy["top1"] - published, 2) if comparable else "",
                "published_source": CLIP_SOURCE_ZEROSHOT if published is not None else "",
                "image_encode_s": round(image_s, 1),
            }
            append_csv(args.zeroshot_csv, row)
            print(f"  → prompts={mode} ({len(templates)}): top1 {accuracy['top1']} · top5 {accuracy['top5']}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="CLIP zero-shot retrieval + classification.")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS, help="TÊN:PRETRAINED (OpenCLIP).")
    parser.add_argument(
        "--datasets", nargs="+", choices=list(DATASETS),
        default=["mscoco_captions", "flickr30k", "cifar10", "cifar100"],
    )
    parser.add_argument("--prompts", nargs="+", choices=["ensemble", "single", "classname"], default=["ensemble"])
    parser.add_argument(
        "--caption-prefix", nargs="+", default=["none"],
        help='Tiền tố thêm vào caption retrieval: none | "a photo of" (paper).',
    )
    parser.add_argument("--image-preprocess", nargs="+", choices=["raw", "backend"], default=["raw"])
    parser.add_argument("--device", default="auto", help="auto | mps | cpu")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--limit", type=int, default=None, help="Chỉ N mẫu đầu (smoke test).")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--retrieval-csv", type=Path, default=RETRIEVAL_CSV)
    parser.add_argument("--zeroshot-csv", type=Path, default=ZEROSHOT_CSV)
    args = parser.parse_args()

    if args.limit:  # smoke test không lẫn vào kết quả chính thức
        args.retrieval_csv = args.retrieval_csv.with_name(args.retrieval_csv.stem + "_smoke.csv")
        args.zeroshot_csv = args.zeroshot_csv.with_name(args.zeroshot_csv.stem + "_smoke.csv")

    from app.providers.clip import OpenClipEmbeddingProvider

    for spec in args.models:
        model, pretrained = parse_model(spec)
        print(f"\n=== {model} · {pretrained} ===", flush=True)
        loaded = time.perf_counter()
        provider = OpenClipEmbeddingProvider(model, pretrained, args.device)
        base_row = {
            "model": model,
            "pretrained": pretrained,
            "dimension": provider.dimension,
            "device": provider._device,
            "batch_size": args.batch_size,
            "load_s": round(time.perf_counter() - loaded, 1),
            **environment_info(),
        }
        import open_clip

        base_row["open_clip"] = open_clip.__version__
        for dataset in args.datasets:
            if DATASETS[dataset]["task"] == "retrieval":
                run_retrieval(provider, (model, pretrained), dataset, args, base_row)
            else:
                run_zeroshot(provider, (model, pretrained), dataset, args, base_row)
        del provider
    print(f"\n→ {args.retrieval_csv}\n→ {args.zeroshot_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
