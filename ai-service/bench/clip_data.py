"""Đọc dataset CLIP_benchmark (webdataset trên HuggingFace `clip-benchmark/wds_*`).

Đây là đúng dữ liệu LAION/OpenCLIP dùng để báo cáo kết quả CLIP. Mỗi dataset
nằm ở `<data-root>/clip_benchmark/<name>/`:

    <name>/
    ├── test/0.tar, 1.tar, ...            # shard webdataset của split test
    ├── classnames.txt                    # (classification) 1 tên lớp / dòng
    └── zeroshot_classification_templates.txt   # (classification) prompt, chứa {c}

Trong tar, các file cùng key (vd `s0000000`) thuộc 1 mẫu:
    retrieval:       s0000000.jpg + s0000000.txt   (mỗi dòng 1 caption)
    classification:  s0000000.webp + s0000000.cls  (chỉ số lớp)
"""
from __future__ import annotations

import tarfile
from dataclasses import dataclass, field
from pathlib import Path

# Tên dùng trong script → repo HuggingFace (repo-type dataset)
DATASETS = {
    "mscoco_captions": {"repo": "clip-benchmark/wds_mscoco_captions", "task": "retrieval"},
    "flickr30k": {"repo": "clip-benchmark/wds_flickr30k", "task": "retrieval"},
    "cifar10": {"repo": "clip-benchmark/wds_vtab-cifar10", "task": "zeroshot"},
    "cifar100": {"repo": "clip-benchmark/wds_vtab-cifar100", "task": "zeroshot"},
    "imagenetv2": {"repo": "clip-benchmark/wds_imagenetv2", "task": "zeroshot"},
}
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def dataset_dir(data_root: Path, name: str) -> Path:
    return data_root.expanduser().resolve() / "clip_benchmark" / name


@dataclass
class RetrievalSet:
    images: list[bytes] = field(default_factory=list)
    captions: list[str] = field(default_factory=list)
    caption_to_image: list[int] = field(default_factory=list)  # caption i → index ảnh


@dataclass
class ClassificationSet:
    images: list[bytes] = field(default_factory=list)
    labels: list[int] = field(default_factory=list)
    classnames: list[str] = field(default_factory=list)
    templates: list[str] = field(default_factory=list)  # dạng "a photo of a {c}."


def _shards(directory: Path) -> list[Path]:
    shards = sorted(
        (directory / "test").glob("*.tar"),
        key=lambda p: int(p.stem) if p.stem.isdigit() else p.stem,
    )
    if not shards:
        raise FileNotFoundError(
            f"Không thấy shard nào trong {directory / 'test'} — xem bench/README.md để tải."
        )
    return shards


def _samples(directory: Path, limit: int | None):
    """Duyệt các mẫu theo thứ tự shard: yield {ext: bytes} cho mỗi key."""
    count = 0
    for shard in _shards(directory):
        current_key, current = None, {}
        with tarfile.open(shard) as tar:
            for member in tar:
                if not member.isfile():
                    continue
                key, dot, ext = member.name.rpartition(".")
                if not dot:
                    continue
                if key != current_key:
                    if current:
                        yield current
                        count += 1
                        if limit and count >= limit:
                            return
                    current_key, current = key, {}
                current["." + ext.lower()] = tar.extractfile(member).read()
        if current:
            yield current
            count += 1
            if limit and count >= limit:
                return


def _image_of(sample: dict) -> bytes | None:
    for ext in IMAGE_EXTS:
        if ext in sample:
            return sample[ext]
    return None


def load_retrieval(data_root: Path, name: str, limit: int | None = None) -> RetrievalSet:
    data = RetrievalSet()
    for sample in _samples(dataset_dir(data_root, name), limit):
        image = _image_of(sample)
        if image is None or ".txt" not in sample:
            continue
        captions = [c.strip() for c in sample[".txt"].decode("utf-8").splitlines() if c.strip()]
        index = len(data.images)
        data.images.append(image)
        data.captions.extend(captions)
        data.caption_to_image.extend([index] * len(captions))
    return data


def load_classification(data_root: Path, name: str, limit: int | None = None) -> ClassificationSet:
    directory = dataset_dir(data_root, name)
    data = ClassificationSet(
        classnames=[
            line.strip()
            for line in (directory / "classnames.txt").read_text().splitlines()
            if line.strip()
        ],
        templates=[
            line.strip()
            for line in (directory / "zeroshot_classification_templates.txt").read_text().splitlines()
            if line.strip()
        ],
    )
    for sample in _samples(directory, limit):
        image = _image_of(sample)
        if image is None or ".cls" not in sample:
            continue
        data.images.append(image)
        data.labels.append(int(sample[".cls"].decode().strip()))
    return data
