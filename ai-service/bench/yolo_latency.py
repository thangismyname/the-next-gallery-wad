"""Đo latency end-to-end batch=1 của YOLO — có NMS (one-to-many) vs NMS-free (e2e).

Kiểm chứng luận điểm chính của YOLOv10 (Table 1–3): bỏ NMS giảm latency
end-to-end. Paper đo trên T4 TensorRT FP16 — không tái lập được trên Mac, nên
script đo cùng PROTOCOL trên máy này (batch 1, 640 px, bỏ I/O) và so tương đối
giữa hai mode / hai họ model.

Protocol:
  - N ảnh đầu của COCO val2017, nạp sẵn vào RAM (bỏ thời gian đọc đĩa — paper
    cũng bỏ I/O overhead).
  - warmup W lần trước khi đo.
  - mỗi ảnh: `model.predict(img, imgsz, conf, nms=...)`; đồng bộ MPS trước khi
    dừng đồng hồ (MPS chạy bất đồng bộ).
  - Ghi: wall (tiền xử lý + model + hậu xử lý), model_ms (inference + postprocess,
    tức latency end-to-end của model), các thành phần, p50/p95, FPS.

Lưu ý MPS: thời gian `inference` từng phần có thể bị dồn sang `postprocess`
(do bất đồng bộ) — so sánh bằng `model_ms` / `wall_ms`, không so từng phần.

Usage (từ ai-service/):
    uv run python -m bench.yolo_latency                                   # v10 n/s/m + 26 n/s/m, mps
    uv run python -m bench.yolo_latency --models yolov10n yolo26n --devices mps cpu
    uv run python -m bench.yolo_latency --images 100 --warmup 10          # nhanh
"""
from __future__ import annotations

import argparse
import statistics
import time
from pathlib import Path

from bench.common import (
    DEFAULT_DATA_ROOT,
    RESULTS_DIR,
    append_csv,
    environment_info,
    sha256_of,
    utc_now,
)
from bench.download_coco import coco_dir
from bench.published import yolo_published
from bench.yolo_coco_val import ensure_weights

DEFAULT_CSV = RESULTS_DIR / "yolo_latency.csv"


def load_images(data_root: Path, count: int) -> list:
    """N ảnh đầu của val2017 (thứ tự file val2017.txt) dạng numpy BGR trong RAM."""
    import cv2

    root = coco_dir(data_root)
    lines = (root / "val2017.txt").read_text().splitlines()[:count]
    images = []
    for line in lines:
        image = cv2.imread(str((root / line).resolve()))
        if image is None:
            raise FileNotFoundError(f"Không đọc được ảnh {line}")
        images.append(image)
    return images


def _sync(device: str) -> None:
    import torch

    if device == "mps":
        torch.mps.synchronize()
    elif device.startswith("cuda"):
        torch.cuda.synchronize()


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q / 100 * (len(ordered) - 1))))
    return ordered[index]


def measure(model, images: list, args: argparse.Namespace, device: str, mode: str) -> dict:
    nms = False if mode == "e2e" else None  # None = head one-to-many + NMS

    def run(image):
        return model.predict(
            image, imgsz=args.imgsz, conf=args.conf, device=device, nms=nms, verbose=False
        )

    for image in images[: args.warmup]:
        run(image)
    _sync(device)

    wall, model_ms, pre, inf, post, n_boxes = [], [], [], [], [], []
    for image in images:
        started = time.perf_counter()
        result = run(image)[0]
        _sync(device)
        wall.append((time.perf_counter() - started) * 1000)
        speed = result.speed  # ms của ảnh này
        pre.append(speed.get("preprocess", 0.0))
        inf.append(speed.get("inference", 0.0))
        post.append(speed.get("postprocess", 0.0))
        model_ms.append(inf[-1] + post[-1])
        n_boxes.append(len(result.boxes) if result.boxes is not None else 0)

    mean = statistics.fmean
    return {
        "wall_mean_ms": round(mean(wall), 2),
        "wall_p50_ms": round(percentile(wall, 50), 2),
        "wall_p95_ms": round(percentile(wall, 95), 2),
        "model_mean_ms": round(mean(model_ms), 2),
        "model_p50_ms": round(percentile(model_ms, 50), 2),
        "model_p95_ms": round(percentile(model_ms, 95), 2),
        "preprocess_mean_ms": round(mean(pre), 2),
        "inference_mean_ms": round(mean(inf), 2),
        "postprocess_mean_ms": round(mean(post), 2),
        "fps": round(1000 / mean(wall), 1),
        "boxes_per_image": round(mean(n_boxes), 1),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="YOLO batch-1 latency: NMS vs NMS-free.")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["yolov10n", "yolov10s", "yolov10m", "yolo26n", "yolo26s", "yolo26m"],
    )
    parser.add_argument("--modes", nargs="+", choices=["e2e", "nms"], default=["e2e", "nms"])
    parser.add_argument("--devices", nargs="+", default=["mps"], help="mps | cpu")
    parser.add_argument("--images", type=int, default=500, help="Số ảnh đo (ảnh đầu của val2017).")
    parser.add_argument("--warmup", type=int, default=20)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Ngưỡng confidence khi predict (mặc định Ultralytics). Ảnh hưởng thời gian NMS.",
    )
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()

    from ultralytics import YOLO

    print(f"Nạp {args.images} ảnh val2017 vào RAM ...", flush=True)
    images = load_images(args.data_root, args.images)

    for model_name in args.models:
        weights = ensure_weights(model_name)
        reference, source = yolo_published(model_name)
        for device in args.devices:
            for mode in args.modes:
                print(f"\n=== {model_name} · {mode} · {device} ===", flush=True)
                model = YOLO(str(weights))  # nạp lại để chắc chắn head đúng theo mode
                stats = measure(model, images, args, device, mode)
                row = {
                    "timestamp": utc_now(),
                    "model": model_name,
                    "mode": mode,
                    "device": device,
                    "imgsz": args.imgsz,
                    "conf": args.conf,
                    "batch": 1,
                    "images": len(images),
                    "warmup": args.warmup,
                    **stats,
                    # Tham chiếu (phần cứng khác — chỉ để đối chiếu thứ tự/tỉ lệ)
                    "published_latency_ms": (reference or {}).get("latency_ms")
                    or (reference or {}).get("t4_trt_ms", ""),
                    "published_hardware": "T4 TensorRT FP16" if reference else "",
                    "published_source": source,
                    "weights_sha256": sha256_of(weights),
                    **environment_info(),
                }
                append_csv(args.csv, row)
                print(
                    f"model {row['model_mean_ms']} ms (p95 {row['model_p95_ms']}) | "
                    f"wall {row['wall_mean_ms']} ms | {row['fps']} FPS | "
                    f"{row['boxes_per_image']} box/ảnh",
                    flush=True,
                )
    print(f"\n→ {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
