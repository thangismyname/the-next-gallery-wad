"""Chạy YOLO + CLIP của ai-service trên cả 1 folder ảnh — không cần server/upload.

Dùng đúng provider của app (`app/providers/`), mặc định tiền xử lý ảnh giống
backend (sharp): EXIF rotate → CLIP: cạnh ≤512 WebP q80, YOLO: cạnh ≤1280 JPEG q85.

Dataset gọi bằng TÊN, tính từ folder Datasets (TNG_DATASETS trong .env gốc dự án):
  <Datasets>/coco/           ảnh đầu vào (quét cả thư mục con)
  <Datasets>/result-coco/    kết quả (tự tạo, chạy lại thì ghi đè)
Bỏ trống tên → hiện danh sách để chọn.

3 lệnh:
  run       quét dataset → YOLO detect + CLIP embed → result-<dataset>/
  search    tìm ảnh bằng câu mô tả (CLIP), lọc thêm theo object (YOLO)
  classify  zero-shot phân loại mọi ảnh theo danh sách nhãn (CLIP)

Usage (từ ai-service/):
  uv run python -m pipeline run coco --limit 200 --draw 20
  uv run python -m pipeline run                      # chọn dataset từ danh sách
  uv run python -m pipeline search "a dog on the beach" "red car"
  uv run python -m pipeline search "playing" --object person -d coco
  uv run python -m pipeline classify indoor outdoor food animal
"""
from __future__ import annotations

import argparse
import csv
import html
import io
import json
import re
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

from bench.common import DEFAULT_DATA_ROOT, environment_info, utc_now

RESULT_PREFIX = "result-"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Giống backend modules/ai/embedding.service.js + detection.service.js
CLIP_QUERY_TEMPLATE = "a photo of a {}"
DEFAULT_MIN_SIM = 0.22  # AI_CLIP_MIN_SIM
DEFAULT_MIN_CONF = 0.4  # AI_YOLO_MIN_CONF (lọc object khi search)


# ── Tiền xử lý ────────────────────────────────────────────────────────────
def reencode(image_bytes: bytes, max_edge: int, fmt: str, quality: int) -> bytes:
    """Như sharp `.rotate().resize(max, max, {fit: inside, withoutEnlargement})`."""
    from PIL import Image, ImageOps

    image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, quality=quality)
    return buffer.getvalue()


def prepare(image_bytes: bytes, preprocess: str) -> tuple[bytes, bytes]:
    """→ (bytes cho CLIP, bytes cho YOLO)."""
    if preprocess == "raw":
        from PIL import Image

        Image.open(io.BytesIO(image_bytes)).verify()  # file hỏng → lỗi ngay ở đây
        return image_bytes, image_bytes
    return reencode(image_bytes, 512, "WEBP", 80), reencode(image_bytes, 1280, "JPEG", 85)


def apply_query_template(query: str) -> str:
    """Port của backend `applyQueryTemplate`: query ≤3 từ → "a photo of a {query}"."""
    trimmed = re.sub(r"[.!?,;:]+$", "", query.strip()).strip()
    words = trimmed.split()
    if not words or len(words) > 3:
        return query
    return CLIP_QUERY_TEMPLATE.format(trimmed)


def find_images(folder: Path, limit: int | None = None) -> list[Path]:
    paths = sorted(
        p for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and not p.name.startswith(".")
    )
    return paths[:limit] if limit else paths


def objects_label(detections: list[dict]) -> str:
    counts = Counter(d["class_name"] for d in detections)
    return ", ".join(f"{name}×{n}" for name, n in counts.most_common())


def draw_detections(image_bytes: bytes, detections: list[dict], out_path: Path) -> None:
    from PIL import Image, ImageDraw

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    draw = ImageDraw.Draw(image)
    line = max(2, round(max(width, height) / 400))
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        box = (x1 * width, y1 * height, x2 * width, y2 * height)
        draw.rectangle(box, outline=(255, 64, 64), width=line)
        label = f"{det['class_name']} {det['confidence']:.2f}"
        text_box = draw.textbbox((box[0], box[1]), label)
        draw.rectangle(text_box, fill=(255, 64, 64))
        draw.text((box[0], box[1]), label, fill=(255, 255, 255))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path, quality=90)


# ── Chọn dataset / kết quả theo tên ───────────────────────────────────────
def result_dir_for(dataset: Path) -> Path:
    """<Datasets>/coco → <Datasets>/result-coco (cạnh folder dataset)."""
    return dataset.parent / f"{RESULT_PREFIX}{dataset.name}"


def list_datasets(data_root: Path) -> list[Path]:
    if not data_root.is_dir():
        return []
    return sorted(
        p for p in data_root.iterdir()
        if p.is_dir() and not p.name.startswith((".", RESULT_PREFIX))
    )


def list_results(data_root: Path) -> list[Path]:
    if not data_root.is_dir():
        return []
    return sorted(p for p in data_root.iterdir() if p.name.startswith(RESULT_PREFIX) and (p / "meta.json").exists())


def choose(options: list[Path], what: str, data_root: Path) -> Path:
    """1 lựa chọn → lấy luôn; nhiều → hỏi số trong terminal."""
    if not options:
        raise SystemExit(f"Không có {what} nào trong {data_root} (đổi TNG_DATASETS trong .env hoặc dùng --data-root).")
    if len(options) == 1:
        print(f"→ {what}: {options[0].name}")
        return options[0]
    if not sys.stdin.isatty():
        raise SystemExit(f"Có nhiều {what}, ghi rõ tên: " + ", ".join(p.name for p in options))
    print(f"Chọn {what} trong {data_root}:")
    for i, path in enumerate(options, 1):
        print(f"  {i}. {path.name}")
    while True:
        answer = input("Số: ").strip()
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return options[int(answer) - 1]
        print(f"  nhập 1–{len(options)}")


def resolve_dataset(name: str | None, data_root: Path) -> Path:
    """Tên ("coco") → <data_root>/coco; path có thật → dùng luôn; trống → chọn."""
    if not name:
        return choose(list_datasets(data_root), "dataset", data_root)
    path = Path(name).expanduser()
    if path.is_dir():
        return path.resolve()
    if (data_root / name).is_dir():
        return (data_root / name).resolve()
    available = ", ".join(p.name for p in list_datasets(data_root)) or "(trống)"
    raise SystemExit(f"Không thấy dataset '{name}' trong {data_root}. Có: {available}")


def resolve_result(name: str | None, data_root: Path) -> Path:
    """"coco" / "result-coco" / path → folder kết quả; trống → chọn."""
    if not name:
        return choose(list_results(data_root), "kết quả (result-*)", data_root)
    path = Path(name).expanduser()
    for candidate in (path, data_root / name, data_root / f"{RESULT_PREFIX}{name}"):
        if (candidate / "meta.json").exists():
            return candidate.resolve()
    raise SystemExit(f"Chưa có kết quả cho '{name}' — chạy `python -m pipeline run {name}` trước.")


# ── Providers ─────────────────────────────────────────────────────────────
def load_clip(model: str, pretrained: str, device: str):
    from app.providers.clip import OpenClipEmbeddingProvider

    print(f"→ CLIP {model} / {pretrained} (lần đầu sẽ tải weights)…", flush=True)
    return OpenClipEmbeddingProvider(model, pretrained, device)


def load_yolo(weights: str, device: str, conf: float, imgsz: int):
    from app.providers.yolo import YoloObjectDetectionProvider

    print(f"→ YOLO {weights} (conf {conf}, {imgsz}px)…", flush=True)
    return YoloObjectDetectionProvider(weights, device, conf, imgsz)


# ── run ───────────────────────────────────────────────────────────────────
def run_folder(
    folder: Path,
    out_dir: Path,
    clip=None,
    yolo=None,
    preprocess: str = "app",
    batch_size: int = 32,
    limit: int | None = None,
    draw: int = 0,
) -> dict:
    """Chạy pipeline, ghi kết quả vào out_dir và trả về meta (cũng lưu ở meta.json)."""
    folder = folder.expanduser().resolve()
    paths = find_images(folder, limit)
    if not paths:
        raise SystemExit(f"Không thấy ảnh ({', '.join(sorted(IMAGE_EXTS))}) trong {folder}")
    if out_dir.exists():
        # Chỉ ghi đè folder kết quả cũ (có meta.json) hoặc folder rỗng — không bao giờ xoá dataset.
        if out_dir.resolve() == folder or not ((out_dir / "meta.json").exists() or not any(out_dir.iterdir())):
            raise SystemExit(f"{out_dir} đã có dữ liệu khác (không phải kết quả pipeline) — chọn --out khác.")
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    print(f"→ {len(paths)} ảnh trong {folder} → {out_dir}", flush=True)
    image_rows, detection_rows, errors = [], [], []
    embeddings: list[np.ndarray] = []
    timing = {"prepare_s": 0.0, "clip_s": 0.0, "yolo_s": 0.0}
    started = time.perf_counter()

    for start in range(0, len(paths), batch_size):
        batch = []
        t0 = time.perf_counter()
        for path in paths[start:start + batch_size]:
            try:
                clip_bytes, yolo_bytes = prepare(path.read_bytes(), preprocess)
            except Exception as exc:  # file hỏng / định dạng không đọc được → bỏ qua, ghi lại
                errors.append(f"{path}\t{type(exc).__name__}: {exc}")
                continue
            batch.append((path, clip_bytes, yolo_bytes))
        timing["prepare_s"] += time.perf_counter() - t0

        if clip is not None and batch:
            t0 = time.perf_counter()
            embeddings.append(np.asarray(clip.encode_images([b[1] for b in batch]), dtype=np.float32))
            timing["clip_s"] += time.perf_counter() - t0

        for path, _, yolo_bytes in batch:
            detections = []
            if yolo is not None:
                t0 = time.perf_counter()
                detections = yolo.detect(yolo_bytes)
                timing["yolo_s"] += time.perf_counter() - t0
            relative = path.relative_to(folder).as_posix()
            index = len(image_rows)
            image_rows.append({
                "index": index, "path": relative,
                "n_objects": len(detections), "objects": objects_label(detections),
            })
            for det in detections:
                x1, y1, x2, y2 = det["bbox"]
                detection_rows.append({
                    "index": index, "path": relative, "class_name": det["class_name"],
                    "confidence": det["confidence"], "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                })
            if index < draw and yolo is not None:
                draw_detections(yolo_bytes, detections, out_dir / "vis" / f"{Path(relative).with_suffix('')}.jpg")

        done = min(start + batch_size, len(paths))
        rate = len(image_rows) / max(time.perf_counter() - started, 1e-9)
        print(f"  [{done:>6}/{len(paths)}] {rate:6.1f} ảnh/s", flush=True)

    _write_csv(out_dir / "images.csv", image_rows, ["index", "path", "n_objects", "objects"])
    _write_csv(out_dir / "detections.csv", detection_rows,
               ["index", "path", "class_name", "confidence", "x1", "y1", "x2", "y2"])
    if embeddings:
        np.save(out_dir / "embeddings.npy", np.vstack(embeddings))
    if errors:
        (out_dir / "errors.txt").write_text("\n".join(errors) + "\n")

    boxes = Counter(r["class_name"] for r in detection_rows)
    images_with = Counter({name: len(idx) for name, idx in _group_indices(detection_rows).items()})
    total_s = time.perf_counter() - started
    meta = {
        "created": utc_now(),
        "folder": str(folder),
        "preprocess": preprocess,
        "images": len(image_rows),
        "errors": len(errors),
        "clip": None if clip is None else {
            "model": clip.model, "pretrained": getattr(clip, "_pretrained", ""),
            "dimension": clip.dimension, "device": str(getattr(clip, "_device", "")),
        },
        "yolo": None if yolo is None else {
            "model": yolo.model, "weights": getattr(yolo, "_weights", ""),
            "conf": getattr(yolo, "_conf", None), "imgsz": getattr(yolo, "_imgsz", None),
            "device": str(getattr(yolo, "_device", "")),
        },
        "timing": {
            **{k: round(v, 2) for k, v in timing.items()},
            "total_s": round(total_s, 2),
            "images_per_s": round(len(image_rows) / max(total_s, 1e-9), 2),
        },
        "class_counts": {
            name: {"boxes": n, "images": images_with[name]} for name, n in boxes.most_common()
        },
        "environment": environment_info(),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    _print_run_summary(meta, out_dir)
    return meta


def _group_indices(detection_rows: list[dict]) -> dict[str, set[int]]:
    """class → tập index ảnh có class đó."""
    groups: dict[str, set[int]] = {}
    for row in detection_rows:
        groups.setdefault(row["class_name"], set()).add(row["index"])
    return groups


def _write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _print_run_summary(meta: dict, out_dir: Path) -> None:
    t = meta["timing"]
    print(f"\n✓ {meta['images']} ảnh ({meta['errors']} lỗi) trong {t['total_s']} s "
          f"— {t['images_per_s']} ảnh/s (CLIP {t['clip_s']} s, YOLO {t['yolo_s']} s)")
    if meta["class_counts"]:
        print("\nObject hay gặp nhất (số ảnh / số box):")
        for name, c in list(meta["class_counts"].items())[:15]:
            print(f"  {name:<16} {c['images']:>6} / {c['boxes']}")
    print(f"\nKết quả: {out_dir}")


# ── load 1 run ────────────────────────────────────────────────────────────
def load_run(run_dir: Path) -> tuple[dict, list[dict], dict[int, list[dict]], np.ndarray | None]:
    meta_path = run_dir / "meta.json"
    if not meta_path.exists():
        raise SystemExit(f"{run_dir} không phải 1 run (thiếu meta.json) — chạy `run` trước.")
    meta = json.loads(meta_path.read_text())
    with open(run_dir / "images.csv", newline="") as fh:
        images = list(csv.DictReader(fh))
    detections: dict[int, list[dict]] = {}
    with open(run_dir / "detections.csv", newline="") as fh:
        for row in csv.DictReader(fh):
            detections.setdefault(int(row["index"]), []).append(row)
    emb_path = run_dir / "embeddings.npy"
    embeddings = np.load(emb_path) if emb_path.exists() else None
    return meta, images, detections, embeddings


def _clip_for_run(meta: dict, device: str):
    if not meta.get("clip"):
        raise SystemExit("Run này chạy với --no-clip → không có embedding để search/classify.")
    return load_clip(meta["clip"]["model"], meta["clip"]["pretrained"], device)


def object_mask(images: list[dict], detections: dict[int, list[dict]], name: str, min_conf: float) -> np.ndarray:
    """Ảnh có ≥1 box class `name` (khớp mờ như backend ILIKE) với confidence ≥ min_conf."""
    name = name.lower()
    mask = np.zeros(len(images), dtype=bool)
    for index, rows in detections.items():
        mask[index] = any(name in r["class_name"].lower() and float(r["confidence"]) >= min_conf for r in rows)
    return mask


# ── search ────────────────────────────────────────────────────────────────
def search_run(
    meta: dict,
    images: list[dict],
    detections: dict[int, list[dict]],
    embeddings: np.ndarray | None,
    queries: list[str],
    clip=None,
    object_name: str | None = None,
    min_conf: float = DEFAULT_MIN_CONF,
    min_sim: float = DEFAULT_MIN_SIM,
    top_k: int = 20,
    raw_query: bool = False,
) -> list[dict]:
    """→ [{query, prompt, hits: [{rank, index, path, score, objects}]}]."""
    mask = np.ones(len(images), dtype=bool)
    if object_name:
        mask &= object_mask(images, detections, object_name, min_conf)

    results = []
    if not queries:  # chỉ lọc object → xếp theo confidence cao nhất của object đó
        scores = np.zeros(len(images), dtype=np.float32)
        for index, rows in detections.items():
            confs = [float(r["confidence"]) for r in rows if object_name.lower() in r["class_name"].lower()]
            scores[index] = max(confs, default=0.0)
        order = [i for i in np.argsort(-scores) if mask[i]][:top_k]
        results.append({"query": f"object: {object_name}", "prompt": "", "hits": _hits(order, scores, images)})
        return results

    prompts = [q if raw_query else apply_query_template(q) for q in queries]
    text = np.asarray(clip.encode_texts(prompts), dtype=np.float32)
    all_scores = embeddings @ text.T  # cosine (cả 2 phía đã L2-norm)
    for col, (query, prompt) in enumerate(zip(queries, prompts)):
        scores = all_scores[:, col]
        keep = mask & (scores >= min_sim)
        order = [i for i in np.argsort(-scores) if keep[i]][:top_k]
        results.append({"query": query, "prompt": prompt, "hits": _hits(order, scores, images)})
    return results


def _hits(order, scores, images) -> list[dict]:
    return [
        {"rank": r + 1, "index": int(i), "path": images[i]["path"], "score": round(float(scores[i]), 4),
         "objects": images[i]["objects"]}
        for r, i in enumerate(order)
    ]


def write_html(path: Path, folder: Path, title: str, sections: list[tuple[str, list[dict]]]) -> None:
    """Trang HTML tĩnh xem kết quả (ảnh trỏ thẳng file gốc trên máy)."""
    parts = [
        f"<!doctype html><meta charset='utf-8'><title>{html.escape(title)}</title>",
        "<style>body{font:14px system-ui;margin:24px}section{margin-bottom:32px}"
        ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}"
        "figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}"
        "figcaption{font-size:12px;color:#555;word-break:break-all}</style>",
        f"<h1>{html.escape(title)}</h1>",
    ]
    for heading, hits in sections:
        parts.append(f"<section><h2>{html.escape(heading)} <small>({len(hits)})</small></h2><div class='grid'>")
        for hit in hits:
            uri = (folder / hit["path"]).as_uri()
            caption = html.escape(f"#{hit['rank']} · {hit['score']:.3f} · {hit['path']}")
            if hit.get("objects"):
                caption += f"<br>{html.escape(hit['objects'])}"
            parts.append(f"<figure><a href='{uri}'><img loading='lazy' src='{uri}'></a>"
                         f"<figcaption>{caption}</figcaption></figure>")
        parts.append("</div></section>")
    path.write_text("\n".join(parts))


# ── classify ──────────────────────────────────────────────────────────────
def classify_run(embeddings: np.ndarray, labels: list[str], clip, templates: list[str]) -> np.ndarray:
    """Zero-shot như CLIP paper: trung bình embedding các prompt / nhãn → chuẩn hoá → softmax."""
    weights = []
    for label in labels:
        vecs = np.asarray(clip.encode_texts([t.format(label) for t in templates]), dtype=np.float32)
        mean = vecs.mean(axis=0)
        weights.append(mean / (np.linalg.norm(mean) or 1.0))
    logits = getattr(clip, "logit_scale", 100.0) * embeddings @ np.stack(weights).T
    logits -= logits.max(axis=1, keepdims=True)
    probs = np.exp(logits)
    return probs / probs.sum(axis=1, keepdims=True)


# ── CLI ───────────────────────────────────────────────────────────────────
def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "query"


def cmd_run(args) -> int:
    from app.config import get_settings

    settings = get_settings()
    clip = None if args.no_clip else load_clip(
        args.clip_model or settings.clip_model, args.clip_pretrained or settings.clip_pretrained, args.device
    )
    yolo = None if args.no_yolo else load_yolo(
        args.yolo_weights or settings.yolo_weights, args.device,
        args.conf if args.conf is not None else settings.yolo_conf, args.imgsz or settings.yolo_imgsz,
    )
    dataset = resolve_dataset(args.dataset, args.data_root)
    out_dir = args.out or result_dir_for(dataset)
    run_folder(dataset, out_dir, clip, yolo, args.preprocess, args.batch_size, args.limit, args.draw)
    return 0


def cmd_search(args) -> int:
    if not args.queries and not args.object:
        raise SystemExit("Cần ít nhất 1 câu truy vấn hoặc --object.")
    args.run = resolve_result(args.dataset, args.data_root)
    meta, images, detections, embeddings = load_run(args.run)
    clip = _clip_for_run(meta, args.device) if args.queries else None
    if args.queries and embeddings is None:
        raise SystemExit("Run này không có embeddings.npy.")
    results = search_run(meta, images, detections, embeddings, args.queries, clip, args.object,
                         args.min_conf, args.min_sim, args.top_k, args.raw_query)

    sections = []
    for res in results:
        heading = res["query"] + (f"  [object: {args.object}]" if args.object and args.queries else "")
        print(f"\n🔎 {heading}" + (f"   → prompt: “{res['prompt']}”" if res["prompt"] != res["query"] else ""))
        if not res["hits"]:
            print(f"   (không có ảnh nào ≥ {args.min_sim} — thử --min-sim 0)")
        for hit in res["hits"]:
            print(f"  {hit['rank']:>3}. {hit['score']:.3f}  {hit['path']}" + (f"   [{hit['objects']}]" if hit["objects"] else ""))
        sections.append((heading, res["hits"]))

    out = args.run / "search.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    page = args.run / "search.html"
    write_html(page, Path(meta["folder"]), "Search — " + args.run.name, sections)
    print(f"\nKết quả: {out}\nXem ảnh: open {page}")
    return 0


def cmd_classify(args) -> int:
    args.run = resolve_result(args.dataset, args.data_root)
    meta, images, _, embeddings = load_run(args.run)
    if embeddings is None:
        raise SystemExit("Run này không có embeddings.npy.")
    clip = _clip_for_run(meta, args.device)
    templates = args.templates or [CLIP_QUERY_TEMPLATE]
    probs = classify_run(embeddings, args.labels, clip, templates)
    best = probs.argmax(axis=1)

    out = args.run / "classify.csv"
    with open(out, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["path", "label", "prob", *args.labels])
        for row, p, b in zip(images, probs, best):
            writer.writerow([row["path"], args.labels[b], round(float(p[b]), 4), *(round(float(x), 4) for x in p)])

    counts = Counter(args.labels[b] for b in best)
    print(f"\nZero-shot {len(images)} ảnh, {len(templates)} template:")
    for label in args.labels:
        print(f"  {label:<20} {counts[label]:>6}  ({100 * counts[label] / len(images):.1f}%)")

    sections = []
    for li, label in enumerate(args.labels):
        order = [i for i in np.argsort(-probs[:, li]) if best[i] == li][:args.top_k]
        sections.append((f"{label} — top {len(order)}", _hits(order, probs[:, li], images)))
    page = args.run / "classify.html"
    write_html(page, Path(meta["folder"]), "Classify — " + args.run.name, sections)
    print(f"\nKết quả: {out}\nXem ảnh: open {page}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m pipeline", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    data_root = argparse.ArgumentParser(add_help=False)
    data_root.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT,
                           help=f"folder Datasets (mặc định TNG_DATASETS = {DEFAULT_DATA_ROOT})")

    run = sub.add_parser("run", parents=[data_root], help="YOLO + CLIP cho cả 1 dataset")
    run.add_argument("dataset", nargs="?", help="tên folder trong Datasets (vd coco) hoặc path; bỏ trống → chọn")
    run.add_argument("--out", type=Path, help="ghi vào folder này thay vì <Datasets>/result-<dataset>")
    run.add_argument("--limit", type=int, help="chỉ lấy N ảnh đầu (chạy thử)")
    run.add_argument("--preprocess", choices=["app", "raw"], default="app",
                     help="app = giống backend (EXIF rotate, CLIP ≤512 WebP, YOLO ≤1280 JPEG); raw = ảnh gốc")
    run.add_argument("--batch-size", type=int, default=32, help="số ảnh / batch CLIP")
    run.add_argument("--draw", type=int, default=0, help="vẽ bbox YOLO cho N ảnh đầu → vis/")
    run.add_argument("--no-clip", action="store_true", help="bỏ CLIP (chỉ YOLO)")
    run.add_argument("--no-yolo", action="store_true", help="bỏ YOLO (chỉ CLIP)")
    run.add_argument("--clip-model", help="mặc định AI_CLIP_MODEL (ViT-B-32)")
    run.add_argument("--clip-pretrained", help="mặc định AI_CLIP_PRETRAINED (laion2b_s34b_b79k)")
    run.add_argument("--yolo-weights", help="mặc định AI_YOLO_WEIGHTS (models/yolo26n.pt)")
    run.add_argument("--conf", type=float, help="ngưỡng YOLO (mặc định AI_YOLO_CONF 0.25)")
    run.add_argument("--imgsz", type=int, help="mặc định AI_YOLO_IMGSZ 640")
    run.add_argument("--device", default="auto", help="auto | mps | cpu | cuda")
    run.set_defaults(func=cmd_run)

    search = sub.add_parser("search", parents=[data_root], help="tìm ảnh bằng câu mô tả / object")
    search.add_argument("queries", nargs="*", help='câu truy vấn tiếng Anh, vd "a dog on the beach"')
    search.add_argument("-d", "--dataset", help="vd coco (→ result-coco); bỏ trống → tự chọn")
    search.add_argument("--object", help="chỉ giữ ảnh có object này (YOLO class, vd person, dog)")
    search.add_argument("--min-conf", type=float, default=DEFAULT_MIN_CONF, help="confidence tối thiểu cho --object")
    search.add_argument("--min-sim", type=float, default=DEFAULT_MIN_SIM, help="cosine tối thiểu (0 = tắt)")
    search.add_argument("--top-k", type=int, default=20)
    search.add_argument("--raw-query", action="store_true", help='không bọc "a photo of a {}" cho query ngắn')
    search.add_argument("--device", default="auto")
    search.set_defaults(func=cmd_search)

    classify = sub.add_parser("classify", parents=[data_root], help="zero-shot phân loại mọi ảnh")
    classify.add_argument("labels", nargs="+", help="≥2 nhãn, vd indoor outdoor food")
    classify.add_argument("-d", "--dataset", help="vd coco (→ result-coco); bỏ trống → tự chọn")
    classify.add_argument("--templates", nargs="+", help='prompt có {} — mặc định "a photo of a {}"')
    classify.add_argument("--top-k", type=int, default=24, help="số ảnh / nhãn trong classify.html")
    classify.add_argument("--device", default="auto")
    classify.set_defaults(func=cmd_classify)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "classify" and len(args.labels) < 2:
        raise SystemExit("Cần ít nhất 2 nhãn.")
    return args.func(args)
