"""Dataset có nhãn cho bench/cls_eval.py — 3 nguồn, mỗi nguồn chấm 1 nhóm tag.

    places6   Places365 val → 6 tag cảnh (một nhãn / ảnh)          task T1 (+T2)
    coco      COCO val2017  → 7 tag đối tượng (nhiều nhãn / ảnh)    task T2
    gallery   ảnh của bạn đã được duyệt trong labels.json → cả 17 tag  (chỉ test)

Layout dưới $TNG_DATASETS:
    places365/{categories_places365.txt, places365_val.txt, val_256/*.jpg}
    coco/{annotations/instances_val2017.json, images/val2017/*.jpg}      (đã có)
    gallery-gt/{images/**, labels.json}     ← labels.json do bench/cls_prelabel.py tạo

Chia train/val/test cố định theo hash tên file (60/20/20) → chạy lại luôn ra
cùng một cách chia, không phụ thuộc thứ tự đọc file.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from bench.cls_taxonomy import (
    OBJECT_TAGS,
    SCENE_TAGS,
    TAG_IDS,
    coco_tags_for,
    places_to_tag,
)

SPLITS = ("train", "val", "test")


@dataclass
class ClsDataset:
    name: str
    root: Path                 # thư mục gốc của ảnh (đường dẫn trong `files` tính từ đây)
    files: list[str]           # đường dẫn tương đối
    tags: list[str]            # các tag dataset này có nhãn (cột của Y)
    Y: np.ndarray              # (N, len(tags)) bool
    split: np.ndarray          # (N,) "train" | "val" | "test"
    single_label: bool = False  # True: mỗi ảnh đúng 1 tag (task T1)
    meta: dict = field(default_factory=dict)

    def paths(self) -> list[Path]:
        return [self.root / f for f in self.files]

    def subset(self, split: str) -> np.ndarray:
        return np.flatnonzero(self.split == split)

    def summary(self) -> str:
        counts = {s: int((self.split == s).sum()) for s in SPLITS}
        pos = ", ".join(f"{t}={int(self.Y[:, i].sum())}" for i, t in enumerate(self.tags))
        return f"{self.name}: {len(self.files)} ảnh {counts} · dương: {pos}"


def stable_split(key: str) -> str:
    bucket = int(hashlib.md5(key.encode()).hexdigest(), 16) % 10
    return "train" if bucket < 6 else "val" if bucket < 8 else "test"


# ── Places365 → 6 tag cảnh ────────────────────────────────────────────────
def load_places6(data_root: Path) -> ClsDataset:
    root = data_root.expanduser().resolve() / "places365"
    categories = root / "categories_places365.txt"
    file_list = root / "places365_val.txt"
    images = root / "val_256"
    for path in (categories, file_list, images):
        if not path.exists():
            raise SystemExit(f"Thiếu {path} — xem bench/README.md (mục Classification).")

    idx_to_name = {}
    for line in categories.read_text().splitlines():
        name, idx = line.split()
        idx_to_name[int(idx)] = name
    mapping = places_to_tag()
    unknown = sorted(set(mapping) - set(idx_to_name.values()))
    if unknown:
        raise SystemExit(f"Tên cảnh không có trong Places365: {unknown} — sửa bench/cls_taxonomy.py")

    files, labels, places = [], [], []
    for line in file_list.read_text().splitlines():
        fname, idx = line.split()
        place = idx_to_name[int(idx)]
        if place in mapping:
            files.append(f"val_256/{fname}")
            labels.append(SCENE_TAGS.index(mapping[place]))
            places.append(place)
    Y = np.zeros((len(files), len(SCENE_TAGS)), dtype=bool)
    Y[np.arange(len(files)), labels] = True
    split = np.array([stable_split(f) for f in files])
    return ClsDataset("places6", root, files, list(SCENE_TAGS), Y, split, single_label=True,
                      meta={"places_category": places})


# ── COCO val2017 → 7 tag đối tượng ────────────────────────────────────────
def load_coco_tags(data_root: Path) -> ClsDataset:
    root = data_root.expanduser().resolve() / "coco"
    ann_file = root / "annotations" / "instances_val2017.json"
    if not ann_file.exists():
        raise SystemExit(f"Thiếu {ann_file} — xem bench/README.md (mục COCO).")
    data = json.loads(ann_file.read_text())
    cat_name = {c["id"]: c["name"] for c in data["categories"]}
    by_image: dict[int, list[dict]] = {}
    images = {img["id"]: img for img in data["images"]}
    for ann in data["annotations"]:
        img = images[ann["image_id"]]
        w, h = ann["bbox"][2], ann["bbox"][3]
        by_image.setdefault(ann["image_id"], []).append({
            "category": cat_name[ann["category_id"]],
            "area_frac": (w * h) / (img["width"] * img["height"]),
            "iscrowd": bool(ann.get("iscrowd", 0)),
        })

    files, rows = [], []
    for img in sorted(data["images"], key=lambda i: i["file_name"]):
        found = coco_tags_for(by_image.get(img["id"], []), img["width"], img["height"])
        files.append(f"images/val2017/{img['file_name']}")
        rows.append([t in found for t in OBJECT_TAGS])
    Y = np.array(rows, dtype=bool)
    split = np.array([stable_split(f) for f in files])
    return ClsDataset("coco", root, files, list(OBJECT_TAGS), Y, split)


# ── Ảnh của bạn (nhãn đã duyệt) → 17 tag, chỉ dùng để test ────────────────
def gallery_root(data_root: Path) -> Path:
    return data_root.expanduser().resolve() / "gallery-gt"


def load_gallery(data_root: Path, reviewed_only: bool = True) -> ClsDataset:
    root = gallery_root(data_root)
    labels_file = root / "labels.json"
    if not labels_file.exists():
        raise SystemExit(
            f"Chưa có {labels_file} — chạy `uv run python -m bench.cls_prelabel` trước, "
            "rồi duyệt nhãn (status = reviewed)."
        )
    doc = json.loads(labels_file.read_text())
    entries = [e for e in doc["images"] if not reviewed_only or e.get("status") == "reviewed"]
    if not entries:
        raise SystemExit(f"{labels_file}: chưa có ảnh nào status = reviewed.")
    files = [f"images/{e['file']}" for e in entries]
    Y = np.array([[t in set(e.get("labels") or []) for t in TAG_IDS] for e in entries], dtype=bool)
    split = np.array(["test"] * len(files))
    return ClsDataset("gallery", root, files, list(TAG_IDS), Y, split)


LOADERS = {"places6": load_places6, "coco": load_coco_tags, "gallery": load_gallery}
