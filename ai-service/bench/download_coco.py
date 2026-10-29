"""Tải COCO val2017 (chỉ tập val) cho benchmark YOLO26.

`coco.yaml` gốc của Ultralytics tải cả train2017 (~19 GB). Script này chỉ lấy:
  - labels YOLO (bbox) + annotations/instances_val2017.json — từ Ultralytics assets
  - ảnh val2017 (5000 ảnh, ~1 GB) — từ images.cocodataset.org
rồi tạo `coco-val2017.yaml` chỉ trỏ vào val.

Usage (từ ai-service/):
    python -m bench.download_coco [--data-root ~/datasets]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from bench.common import DEFAULT_DATA_ROOT

LABELS_ZIP = "coco2017labels.zip"  # bbox labels (không cần segments cho detection)
VAL_IMAGES_URL = "http://images.cocodataset.org/zips/val2017.zip"
EXPECTED_VAL_IMAGES = 5000


def coco_dir(data_root: Path) -> Path:
    return data_root.expanduser().resolve() / "coco"


def val_yaml_path(data_root: Path) -> Path:
    return coco_dir(data_root) / "coco-val2017.yaml"


def write_val_yaml(root: Path) -> Path:
    """yaml chỉ dùng val2017 — `train` trỏ cùng val để ultralytics không đòi train."""
    import ultralytics
    from ultralytics.utils import YAML

    base = YAML.load(Path(ultralytics.__file__).parent / "cfg/datasets/coco.yaml")
    data = {
        "path": str(root),
        "train": "val2017.txt",
        "val": "val2017.txt",
        "names": base["names"],
    }
    target = root / "coco-val2017.yaml"
    YAML.save(target, data)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Tải COCO val2017 cho benchmark.")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    args = parser.parse_args()

    from ultralytics.utils import ASSETS_URL
    from ultralytics.utils.downloads import download

    root = coco_dir(args.data_root)
    root.parent.mkdir(parents=True, exist_ok=True)

    if not (root / "labels" / "val2017").exists():
        print(f"→ Labels: {LABELS_ZIP} → {root.parent}", flush=True)
        download([f"{ASSETS_URL}/{LABELS_ZIP}"], dir=root.parent)
    else:
        print("✔ Labels đã có", flush=True)

    images_dir = root / "images" / "val2017"
    if not images_dir.exists() or len(list(images_dir.glob("*.jpg"))) < EXPECTED_VAL_IMAGES:
        print(f"→ Ảnh val2017 (~1 GB) → {root / 'images'}", flush=True)
        download([VAL_IMAGES_URL], dir=root / "images")
    else:
        print("✔ Ảnh val2017 đã có", flush=True)

    n_images = len(list(images_dir.glob("*.jpg")))
    n_labels = len(list((root / "labels" / "val2017").glob("*.txt")))
    annotations = root / "annotations" / "instances_val2017.json"
    yaml_path = write_val_yaml(root)

    print(f"\nảnh val2017:   {n_images} (kỳ vọng {EXPECTED_VAL_IMAGES})")
    print(f"label files:   {n_labels} (ảnh không có object thì không có file label)")
    print(f"annotations:   {'có' if annotations.exists() else 'THIẾU'} {annotations}")
    print(f"dataset yaml:  {yaml_path}")
    return 0 if n_images == EXPECTED_VAL_IMAGES and annotations.exists() else 1


if __name__ == "__main__":
    raise SystemExit(main())
