#!/usr/bin/env python3
"""Pre-download DINOv3 weights (image similarity) vào ai-service/models/.

Usage:
    uv run python scripts/download_dino_weight.py \
        [--repo facebook/dinov3-vits16-pretrain-lvd1689m ...] [--dir models/<tên repo>]

    # benchmark (bench/dino_retrieval.py) cần thêm S+/16 và B/16:
    uv run python scripts/download_dino_weight.py --repo \
        facebook/dinov3-vits16-pretrain-lvd1689m \
        facebook/dinov3-vits16plus-pretrain-lvd1689m \
        facebook/dinov3-vitb16-pretrain-lvd1689m

Checkpoint DINOv3 trên Hugging Face là GATED. Trước khi chạy:
  1. Mở trang từng model (vd https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m),
     đăng nhập và bấm chấp nhận DINOv3 License — mỗi repo gated riêng.
  2. Tạo token (Read) tại https://huggingface.co/settings/tokens rồi
     `uv run hf auth login` (hoặc export HF_TOKEN=...).

Sau khi tải xong, đặt AI_SIMILARITY_PROVIDER=dinov3 — provider đọc từ thư mục
local (AI_DINO_MODEL, mặc định models/dinov3-vits16-pretrain-lvd1689m).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPO = "facebook/dinov3-vits16-pretrain-lvd1689m"


def main() -> int:
    parser = argparse.ArgumentParser(description="Tải DINOv3 weights.")
    parser.add_argument(
        "--repo",
        nargs="+",
        default=[DEFAULT_REPO],
        help=f"HF repo id, có thể nhiều (default: {DEFAULT_REPO}).",
    )
    parser.add_argument(
        "--dir",
        default=None,
        help="Thư mục đích khi tải 1 repo (default: ai-service/models/<tên repo>).",
    )
    args = parser.parse_args()
    if args.dir and len(args.repo) > 1:
        parser.error("--dir chỉ dùng khi tải 1 repo.")

    status = 0
    for repo in args.repo:
        target = Path(args.dir) if args.dir else SERVICE_ROOT / "models" / repo.split("/")[-1]
        status |= download(repo, target)
    return status


def download(repo: str, target: Path) -> int:
    target.mkdir(parents=True, exist_ok=True)

    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import GatedRepoError, RepositoryNotFoundError

    print(f"Đang tải {repo!r} vào {str(target)!r} ...", flush=True)
    try:
        snapshot_download(
            repo_id=repo,
            local_dir=target,
            allow_patterns=["*.json", "*.safetensors", "*.md"],
            token=os.environ.get("HF_TOKEN"),
        )
    except (GatedRepoError, RepositoryNotFoundError) as exc:
        print(
            "Lỗi: không có quyền tải model (gated). Hãy chấp nhận license trên "
            f"https://huggingface.co/{repo} rồi `uv run hf auth login`.\n"
            f"Chi tiết: {exc}",
            file=sys.stderr,
        )
        # Không để lại thư mục rỗng — provider sẽ tưởng là weights local.
        if target.exists() and not any(p.is_file() for p in target.rglob("*")):
            import shutil

            shutil.rmtree(target)
        return 1

    # Kiểm tra load được + in số chiều để khớp cột vector(384) của backend.
    from transformers import AutoConfig

    config = AutoConfig.from_pretrained(target)
    print(
        f"✅ Done. model_type={config.model_type} hidden_size={config.hidden_size}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
