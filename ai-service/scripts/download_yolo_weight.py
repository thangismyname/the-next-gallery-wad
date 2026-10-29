#!/usr/bin/env python3
"""Pre-download YOLO26 weights (object detection) — phục vụ backfill/search/benchmark.

Usage:
    python scripts/download_yolo_weight.py [--model yolo26n.pt] [--dir models]

Ultralytics tải weights về thư mục làm việc (cwd), nên script chuyển cwd sang
`--dir` rồi khởi tạo YOLO(model) để file .pt nằm đúng chỗ.
- Docker: Dockerfile truyền `--dir /opt/yolo-cache` để bake weights vào image.
- Máy local (vd Mac M1): mặc định `ai-service/models/` (đã git-ignore).

Sau khi tải, script in SHA-256 của file + phiên bản ultralytics — ghi lại vào
báo cáo benchmark để kết quả tái lập được (Ultralytics có thể cập nhật weights
cùng tên). Set `AI_YOLO_WEIGHTS=<dir>/<model>` để provider dùng file đã tải.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "models"


def sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def report(target: str) -> None:
    try:
        import ultralytics

        version = ultralytics.__version__
    except ImportError:
        version = "not installed"
    print(f"   file:        {target}", flush=True)
    print(f"   sha256:      {sha256_of(target)}", flush=True)
    print(f"   ultralytics: {version}", flush=True)
    print(f"   → set AI_YOLO_WEIGHTS={target}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Tải YOLO26 weights.")
    parser.add_argument(
        "--model",
        default=os.path.basename(os.environ.get("AI_YOLO_WEIGHTS", "yolo26n.pt")),
        help="Tên file weights, vd yolo26n.pt / yolo26s.pt (default: yolo26n.pt).",
    )
    parser.add_argument(
        "--dir",
        default=os.environ.get("AI_YOLO_DIR", str(DEFAULT_DIR)),
        help="Thư mục chứa weights (default: $AI_YOLO_DIR hoặc ai-service/models).",
    )
    args = parser.parse_args()

    target_dir = os.path.abspath(args.dir)
    os.makedirs(target_dir, exist_ok=True)
    model_file = os.path.basename(args.model)
    target = os.path.join(target_dir, model_file)

    if os.path.exists(target):
        print("✅ Weights đã có sẵn:", flush=True)
        report(target)
        return 0

    try:
        from ultralytics import YOLO
    except ImportError:
        print(
            "Lỗi: chưa cài ultralytics. Chạy: uv sync",
            file=sys.stderr,
        )
        return 1

    print(f"Đang tải YOLO weights {model_file!r} vào {target_dir!r} ...", flush=True)
    os.chdir(target_dir)
    YOLO(model_file)

    if os.path.exists(target):
        print("✅ Done:", flush=True)
        report(target)
        return 0
    print(f"⚠️  Không thấy file {target} sau khi tải.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
