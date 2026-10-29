"""Chạy `benchmark()` chính thức của Ultralytics — mAP + tốc độ theo định dạng export.

Đây là công cụ Ultralytics dùng để đo YOLO26 theo định dạng (docs: Modes →
Benchmark). Mỗi định dạng: export model → predict thử → `val` batch=1 trên
dataset → ghi mAP50-95, thời gian inference (ms/ảnh), FPS, kích thước file.

Định dạng chạy được trên Mac:
  pytorch — `.pt` gốc (device mps hoặc cpu)
  onnx    — ONNX Runtime trên CPU → so với cột "Speed CPU ONNX" của docs YOLO26
  coreml  — chưa bật: coremltools đòi numpy<=2.3.5, xung đột với uv.lock hiện tại

Lưu ý: `val` của benchmark dùng batch=1 nên chạy toàn bộ 5000 ảnh khá lâu —
dùng `--limit` để chạy tập con (mAP khi đó KHÔNG so được với số công bố).

Usage (từ ai-service/):
    uv run python -m bench.yolo_export_benchmark --models yolo26n yolov10n --limit 500
    uv run python -m bench.yolo_export_benchmark --models yolo26n --formats onnx --modes e2e
"""
from __future__ import annotations

import argparse
import contextlib
from pathlib import Path

from bench.common import (
    DEFAULT_DATA_ROOT,
    RESULTS_DIR,
    RUNS_DIR,
    append_csv,
    environment_info,
    sha256_of,
    utc_now,
)
from bench.download_coco import val_yaml_path
from bench.published import yolo_published
from bench.yolo_coco_val import ensure_weights, subset_yaml

DEFAULT_CSV = RESULTS_DIR / "yolo_export_benchmark.csv"

# Tên định dạng của script → (argument `format` của Ultralytics, device)
FORMATS = {
    "pytorch-mps": ("-", "mps"),
    "pytorch-cpu": ("-", "cpu"),
    "onnx": ("onnx", "cpu"),
}
METRIC_KEY = "metrics/mAP50-95(B)"


def run_benchmark(weights: Path, data_yaml: Path, fmt: str, mode: str, imgsz: int) -> dict:
    from ultralytics.utils.benchmarks import benchmark

    ultra_format, device = FORMATS[fmt]
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    # benchmark() ghi benchmarks.log vào cwd → đặt trong runs/ (git-ignored).
    with contextlib.chdir(RUNS_DIR):
        table = benchmark(
            model=str(weights),
            data=str(data_yaml),
            imgsz=imgsz,
            device=device,
            format=ultra_format,
            # None = head one-to-many + NMS; False = head NMS-free (cho cả bản export)
            nms=False if mode == "e2e" else None,
        )
    row = table.row(0, named=True)
    status = str(row.get("Status❔", ""))

    def as_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return ""

    metric = as_float(row.get(METRIC_KEY))
    return {
        "status": "ok" if "✅" in status else status,
        "size_mb": as_float(row.get("Size (MB)")),
        "map50_95": round(metric * 100, 2) if metric != "" else "",
        "inference_ms": as_float(row.get("Inference time (ms/im)")),
        "fps": as_float(row.get("FPS")),
        "device": device,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ultralytics benchmark() theo định dạng export.")
    parser.add_argument("--models", nargs="+", default=["yolov10n", "yolo26n"])
    parser.add_argument("--formats", nargs="+", choices=list(FORMATS), default=list(FORMATS))
    parser.add_argument("--modes", nargs="+", choices=["e2e", "nms"], default=["e2e"])
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--limit", type=int, default=None, help="Chỉ N ảnh đầu của val2017.")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()

    data_yaml = val_yaml_path(args.data_root)
    if not data_yaml.exists():
        print(f"Chưa có {data_yaml} — chạy trước: python -m bench.download_coco")
        return 1
    if args.limit:
        data_yaml = subset_yaml(args.data_root, args.limit)

    for model_name in args.models:
        weights = ensure_weights(model_name)
        reference, source = yolo_published(model_name)
        for mode in args.modes:
            for fmt in args.formats:
                print(f"\n=== {model_name} · {fmt} · {mode} ===", flush=True)
                result = run_benchmark(weights, data_yaml, fmt, mode, args.imgsz)
                row = {
                    "timestamp": utc_now(),
                    "model": model_name,
                    "format": fmt,
                    "mode": mode,
                    "imgsz": args.imgsz,
                    "batch": 1,
                    "images": args.limit or 5000,
                    **result,
                    "published_map50_95": (reference or {}).get(mode, ""),
                    "published_cpu_onnx_ms": (reference or {}).get("cpu_onnx_ms", ""),
                    "published_source": source,
                    "weights_sha256": sha256_of(weights),
                    **environment_info(),
                }
                append_csv(args.csv, row)
                print(
                    f"{row['status']} | mAP50-95 {row['map50_95']} | "
                    f"{row['inference_ms']} ms/ảnh | {row['fps']} FPS | {row['size_mb']} MB",
                    flush=True,
                )
    print(f"\n→ {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
