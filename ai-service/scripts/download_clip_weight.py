#!/usr/bin/env python3
"""Pre-download OpenCLIP model weights (image + text encoder) — semantic search.

Usage:
    python scripts/download_clip_weight.py [--model ViT-B-32] \
        [--pretrained laion2b_s34b_b79k] [--dir ~/.cache/clip]

OpenCLIP lưu weights vào `$HOME/.cache/clip`. Script đặt `HOME=<dir>` rồi gọi
`create_model_and_transforms` để tải về + kiểm tra model load được, sau đó in
đường dẫn cache. Dùng trong Dockerfile để bake weights vào image (runtime
không cần internet), hoặc chạy thủ công trên host với `--dir` tuỳ ý.
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Tải OpenCLIP weights.")
    parser.add_argument(
        "--model",
        default=os.environ.get("AI_CLIP_MODEL", "ViT-B-32"),
        help="Tên model OpenCLIP (default: $AI_CLIP_MODEL hoặc ViT-B-32).",
    )
    parser.add_argument(
        "--pretrained",
        default=os.environ.get("AI_CLIP_PRETRAINED", "laion2b_s34b_b79k"),
        help="Pretrained tag (default: $AI_CLIP_PRETRAINED hoặc laion2b_s34b_b79k).",
    )
    parser.add_argument(
        "--dir",
        default=os.path.join(os.path.expanduser("~"), ".cache", "clip"),
        help="Thư mục cache chứa weights (default: ~/.cache/clip).",
    )
    args = parser.parse_args()

    os.makedirs(args.dir, exist_ok=True)
    os.environ["HOME"] = args.dir

    try:
        import open_clip
    except ImportError:
        print(
            "Lỗi: chưa cài open_clip_torch. Chạy: "
            "pip install open_clip_torch (Dockerfile đã cài sẵn).",
            file=sys.stderr,
        )
        return 1

    print(
        f"Đang tải model {args.model!r} ({args.pretrained}) vào {args.dir!r} ...",
        flush=True,
    )
    open_clip.create_model_and_transforms(args.model, pretrained=args.pretrained)
    print(
        "✅ Done. Khi chạy ai-service nhớ để HOME trỏ đúng cache "
        f"(vd ENV HOME={args.dir}) để không tải lại.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
