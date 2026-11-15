"""Open Images V7: đọc annotation gốc, chọn subset, build nhãn có mask.

Bố cục (bạn tự tải, xem README "Part 0"):

    $TNG_DATASETS/Classes/open-images/        # CSV / JSON / JSONL gốc của Open Images
    │   ├── oidv7-class-descriptions.csv
    │   ├── oidv7-class-descriptions-boxable.csv
    │   ├── bbox_labels_600_hierarchy.json
    │   ├── oidv7-val-annotations-human-imagelabels.csv   · oidv7-test-…
    │   ├── validation-annotations-bbox.csv               · test-annotations-bbox.csv
    │   ├── validation-images-with-rotation.csv           · test-images-with-rotation.csv
    │   └── open_images_validation_localized_narratives.jsonl · open_images_test_…
    │   ├── judgments.csv                    # pool chấm tay (E3c, E6)
    │   └── subset/                          # do `experiments select|build` sinh ra
    │       ├── classes.json                 # mapping đã resolve (MID, hậu duệ)
    │       ├── <split>_ids.txt · download_<split>.txt · <split>_selection.json
    │       └── <split>.npz · <split>_boxes.json · <split>_captions.json · <split>_build.json
    $TNG_DATASETS/Data/open-images/<split>/<ImageID>.jpg   # tải bằng downloader.py

Quy ước nhãn image-level (ghi trong luận văn):
  * Chỉ dùng nhãn NGƯỜI xác minh (human-verified). Positive = lớp c hoặc một lớp con
    của c (cây `bbox_labels_600_hierarchy.json`, chỉ quan hệ Subcategory) được xác
    minh positive. Negative = c (hoặc một lớp cha của c) được xác minh negative và
    không có positive nào ở trên. Còn lại = -1 (không biết) → bị mask.
  * Box group-of (IsGroupOf=1) giữ riêng, E4 chấm theo giao thức Open Images.
  * Box của lớp con được tính cho lớp cha có trong mapping (vd Man → Person).
  * Ảnh có Rotation ≠ 0 (CSV) hoặc EXIF Orientation ≠ 1 bị loại để box khỏi lệch.
"""
from __future__ import annotations

import csv
import difflib
import hashlib
import json
import re
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from experiments.core import PACKAGE_DATA, oi_classes_root, oi_images_root, write_json

SPLITS = ("train", "validation", "test")  # train: tuỳ chọn, chỉ để TRAIN probe / fusion / YOLO
DEFAULT_MAPPING = PACKAGE_DATA / "oi_classes.csv"

# Tên file chấp nhận cho từng loại annotation (bản đầu tiên tìm thấy được dùng).
FILES = {
    "classes": ["oidv7-class-descriptions.csv"],
    "classes_boxable": ["oidv7-class-descriptions-boxable.csv", "class-descriptions-boxable.csv"],
    "hierarchy": ["bbox_labels_600_hierarchy.json"],
    ("labels", "validation"): ["oidv7-val-annotations-human-imagelabels.csv"],
    ("labels", "test"): ["oidv7-test-annotations-human-imagelabels.csv"],
    ("labels", "train"): ["oidv7-train-annotations-human-imagelabels.csv"],
    ("boxes", "validation"): ["validation-annotations-bbox.csv", "oidv6-validation-annotations-bbox.csv"],
    ("boxes", "test"): ["test-annotations-bbox.csv", "oidv6-test-annotations-bbox.csv"],
    ("boxes", "train"): ["oidv6-train-annotations-bbox.csv", "train-annotations-bbox.csv"],
    ("images", "validation"): ["validation-images-with-rotation.csv"],
    ("images", "test"): ["test-images-with-rotation.csv"],
    ("images", "train"): ["train-images-boxable-with-rotation.csv"],
    ("narratives", "validation"): ["open_images_validation_localized_narratives.jsonl"],
    ("narratives", "test"): ["open_images_test_localized_narratives.jsonl"],
}
# train là phần thêm (E2–E6 bản có train) → mọi file train đều tuỳ chọn. Narratives train không dùng.
OPTIONAL = {("narratives", "validation"), ("narratives", "test"), ("images", "validation"),
            ("images", "test"), ("labels", "train"), ("boxes", "train"), ("images", "train")}


def annotations_dir(data_root: Path) -> Path:
    return oi_classes_root(data_root)


def subset_dir(data_root: Path) -> Path:
    return oi_classes_root(data_root) / "subset"


def images_dir(data_root: Path, split: str) -> Path:
    return oi_images_root(data_root) / split


def find_file(data_root: Path, key, required: bool = True) -> Path | None:
    base = annotations_dir(data_root)
    for name in FILES.get(key, []):
        if (base / name).exists():
            return base / name
    if required:
        name = FILES[key][0] if FILES.get(key) else "/".join(key)
        raise SystemExit(f"Thiếu file Open Images {name} trong {base} — xem README Part 0.")
    return None


def file_status(data_root: Path) -> list[dict]:
    """Trạng thái từng file annotation (lệnh `status`, admin UI)."""
    rows = []
    for key, names in FILES.items():
        path = find_file(data_root, key, required=False)
        rows.append({"key": key if isinstance(key, str) else "/".join(key), "file": names[0],
                     "present": path is not None, "optional": key in OPTIONAL,
                     "size_mb": round(path.stat().st_size / 1e6, 1) if path else None})
    return rows


# ── Lớp + cây phân cấp ────────────────────────────────────────────────────
def _read_descriptions(path: Path) -> list[tuple[str, str]]:
    with open(path, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.reader(fh) if len(r) >= 2]
    if rows and rows[0][0] == "LabelName":
        rows = rows[1:]
    return [(r[0], r[1]) for r in rows]


def load_hierarchy(path: Path) -> dict[str, set[str]]:
    """MID → các MID con trực tiếp (chỉ Subcategory, bỏ Part)."""
    children: dict[str, set[str]] = {}

    def walk(node: dict) -> None:
        for sub in node.get("Subcategory", []):
            children.setdefault(node["LabelName"], set()).add(sub["LabelName"])
            walk(sub)

    walk(json.loads(path.read_text()))
    return children


def _closure(start: str, graph: dict[str, set[str]]) -> set[str]:
    seen, stack = set(), [start]
    while stack:
        for nxt in graph.get(stack.pop(), ()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen


def read_mapping(path: Path = DEFAULT_MAPPING) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        rows = [{k: (v or "").strip() for k, v in r.items()}
                for r in csv.DictReader(line for line in fh if not line.lstrip().startswith("#"))]
    rows = [r for r in rows if r.get("oi_name")]
    for r in rows:
        if r.get("group") not in ("object", "scene"):
            raise SystemExit(f"{path.name}: lớp {r['oi_name']!r} cần group = object | scene")
    names = [r["oi_name"] for r in rows]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        raise SystemExit(f"{path.name}: lớp trùng {sorted(dup)}")
    return rows


def resolve_classes(data_root: Path, mapping_path: Path = DEFAULT_MAPPING) -> list[dict]:
    """Mapping CSV (tên hiển thị) → MID + hậu duệ + tổ tiên. Lỗi kèm gợi ý tên gần đúng."""
    mapping = read_mapping(mapping_path)
    all_desc = _read_descriptions(find_file(data_root, "classes"))
    boxable = {mid for mid, _ in _read_descriptions(find_file(data_root, "classes_boxable"))}
    by_name: dict[str, list[str]] = {}
    for mid, name in all_desc:
        by_name.setdefault(name, []).append(mid)
    lower: dict[str, list[str]] = {}
    for name, mids in by_name.items():
        lower.setdefault(name.lower(), []).extend(mids)
    display = {mid: name for mid, name in all_desc}

    children = load_hierarchy(find_file(data_root, "hierarchy"))
    parents: dict[str, set[str]] = {}
    for p, cs in children.items():
        for c in cs:
            parents.setdefault(c, set()).add(p)

    errors, out = [], []
    for row in mapping:
        name = row["oi_name"]
        if row.get("oi_mid"):
            mids = [row["oi_mid"]]
        else:
            mids = by_name.get(name) or lower.get(name.lower()) or []
            if len(mids) > 1:
                boxed = [m for m in mids if m in boxable]
                mids = boxed if len(boxed) == 1 else mids
        if len(mids) != 1:
            if mids:
                errors.append(f"  {name!r}: nhiều MID {mids} — ghi rõ cột oi_mid")
            else:
                near = difflib.get_close_matches(name, list(by_name), n=4, cutoff=0.7)
                errors.append(f"  {name!r}: không có trong Open Images — gần nhất: {near}")
            continue
        mid = mids[0]
        out.append({
            **row, "oi_mid": mid, "display": display.get(mid, name), "boxable": mid in boxable,
            "descendants": sorted(_closure(mid, children)),
            "ancestors": sorted(_closure(mid, parents)),
        })
    if errors:
        raise SystemExit("Mapping lớp có lỗi (sửa experiments/data/oi_classes.csv):\n" + "\n".join(errors))
    return out


def mapping_hash(classes: list[dict]) -> str:
    key = json.dumps([(c["oi_mid"], c["group"], c.get("coco", "")) for c in classes])
    return hashlib.sha1(key.encode()).hexdigest()[:10]


# ── Nhãn image-level ──────────────────────────────────────────────────────
def relevant_mids(classes: list[dict]) -> set[str]:
    mids = set()
    for c in classes:
        mids.add(c["oi_mid"])
        mids.update(c["descendants"])
        mids.update(c["ancestors"])
    return mids


def stream_image_labels(data_root: Path, split: str, mids: set[str], only_ids: set[str] | None = None,
                        progress=None, keep_id=None) -> dict[str, dict[str, int]]:
    """ImageID → {MID: 1|0} (chỉ nhãn người xác minh, chỉ MID quan tâm).
    `keep_id(image_id) -> bool` lọc thêm (train: chỉ ảnh boxable + mẫu theo hash)."""
    out: dict[str, dict[str, int]] = {}
    path = find_file(data_root, ("labels", split))
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)  # csv.reader + chỉ số cột: nhanh hơn DictReader nhiều (file train 2,7 GB)
        head = next(reader)
        i_id, i_label, i_conf = head.index("ImageID"), head.index("LabelName"), head.index("Confidence")
        i_src = head.index("Source") if "Source" in head else None
        for n, row in enumerate(reader):
            if progress and n % 5_000_000 == 0:
                progress(f"đọc {path.name}: {n:,} dòng")
            if row[i_label] not in mids:
                continue
            image_id = row[i_id]
            if only_ids is not None and image_id not in only_ids:
                continue
            if keep_id is not None and not keep_id(image_id):
                continue
            if i_src is not None and row[i_src].lower().startswith("machine"):
                continue
            out.setdefault(image_id, {})[row[i_label]] = 1 if float(row[i_conf]) >= 0.5 else 0
    return out


def derive_labels(verified: dict[str, int], classes: list[dict]) -> np.ndarray:
    """Vector nhãn {1, 0, -1} của 1 ảnh theo quy ước ở đầu file."""
    y = np.full(len(classes), -1, dtype=np.int8)
    for j, c in enumerate(classes):
        if verified.get(c["oi_mid"]) == 1 or any(verified.get(d) == 1 for d in c["descendants"]):
            y[j] = 1
        elif verified.get(c["oi_mid"]) == 0 or any(verified.get(a) == 0 for a in c["ancestors"]):
            y[j] = 0
    return y


def read_image_list(data_root: Path, split: str) -> tuple[set[str], set[str]]:
    """(mọi ImageID trong *-images-with-rotation.csv, các ảnh có Rotation ≠ 0). Rỗng nếu chưa tải.
    Với train file này chỉ liệt kê ảnh **boxable** (~1,7 triệu) → dùng làm tập ứng viên luôn."""
    path = find_file(data_root, ("images", split), required=False)
    if path is None:
        return set(), set()
    listed, rotated = set(), set()
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        head = next(reader)
        i_id, i_rot = head.index("ImageID"), head.index("Rotation")
        for row in reader:
            listed.add(row[i_id])
            rot = row[i_rot].strip() if len(row) > i_rot else ""
            if rot and float(rot) != 0.0:
                rotated.add(row[i_id])
    return listed, rotated


def hash_fraction(image_id: str) -> float:
    """ImageID → [0, 1) cố định (crc32) — lấy mẫu train tái lập được, không phụ thuộc thứ tự file."""
    return zlib.crc32(image_id.encode()) / 2**32


# ── Chọn subset ───────────────────────────────────────────────────────────
def select_subset(labels: dict[str, dict[str, int]], classes: list[dict], n_images: int,
                  min_pos: int, exclude: set[str], seed: int) -> tuple[list[str], np.ndarray]:
    """Chọn n ảnh:
    (1) phủ lớp theo VÒNG: mỗi vòng, mỗi lớp còn < min_pos positive được thêm 1 ảnh
        positive ngẫu nhiên (lớp hiếm đi trước trong vòng) — ngân sách chia đều, lớp phổ
        biến không bị bỏ đói khi lớp hiếm ăn hết chỗ;
    (2) lấp đầy ngẫu nhiên bằng ảnh có ≥1 positive, (3) rồi ảnh bất kỳ có nhãn."""
    rng = np.random.default_rng(seed)
    ids = sorted(i for i in labels if i not in exclude)
    Y = np.stack([derive_labels(labels[i], classes) for i in ids]) if ids else np.zeros((0, len(classes)), np.int8)
    has_known = (Y != -1).any(axis=1)
    ids = [i for i, k in zip(ids, has_known) if k]
    Y = Y[has_known]
    order = rng.permutation(len(ids))
    chosen: list[int] = []
    taken = np.zeros(len(ids), bool)
    pos_count = np.zeros(len(classes), int)

    def take(i: int) -> None:
        taken[i] = True
        chosen.append(int(i))
        pos_count[:] += Y[i] == 1

    pools = [order[Y[order, c] == 1] for c in range(len(classes))]  # ảnh positive, thứ tự ngẫu nhiên
    cursor = np.zeros(len(classes), int)
    by_rarity = np.argsort([len(p) for p in pools], kind="stable")
    progressed = True
    while progressed and len(chosen) < n_images:
        progressed = False
        for c in by_rarity:
            if len(chosen) >= n_images:
                break
            if pos_count[c] >= min_pos:
                continue
            pool = pools[c]
            while cursor[c] < len(pool) and taken[pool[cursor[c]]]:
                cursor[c] += 1
            if cursor[c] < len(pool):
                take(pool[cursor[c]])
                progressed = True
    for want_pos in (True, False):
        for i in order:
            if len(chosen) >= n_images:
                break
            if not taken[i] and (not want_pos or (Y[i] == 1).any()):
                take(i)
    chosen.sort(key=lambda i: ids[i])
    return [ids[i] for i in chosen], Y[chosen]


# ── Subset đã build ───────────────────────────────────────────────────────
@dataclass
class OISubset:
    split: str
    image_ids: list[str]
    Y: np.ndarray                    # (N, C) int8 ∈ {1, 0, -1}
    classes: list[dict]
    root: Path
    sizes: np.ndarray                # (N, 2) width, height
    boxes: dict[str, list] = field(default_factory=dict)      # id → [[c, x1, y1, x2, y2, group], …]
    captions: dict[str, list[str]] = field(default_factory=dict)

    @property
    def name(self) -> str:
        return f"oi-{self.split}"

    @property
    def files(self) -> list[str]:
        return [f"{i}.jpg" for i in self.image_ids]

    def paths(self) -> list[Path]:
        base = images_dir(self.root, self.split)
        return [base / f for f in self.files]

    @property
    def class_names(self) -> list[str]:
        return [c["oi_name"] for c in self.classes]

    def group_cols(self, group: str) -> list[int]:
        return [j for j, c in enumerate(self.classes) if c["group"] == group]

    def take(self, n: int) -> "OISubset":
        """n ảnh đầu (smoke test)."""
        keep = set(self.image_ids[:n])
        return OISubset(self.split, self.image_ids[:n], self.Y[:n], self.classes, self.root,
                        self.sizes[:n], {k: v for k, v in self.boxes.items() if k in keep},
                        {k: v for k, v in self.captions.items() if k in keep})


def load_subset(data_root: Path, split: str, smoke: int = 0) -> OISubset:
    base = subset_dir(data_root)
    npz = base / f"{split}.npz"
    if not npz.exists():
        raise SystemExit(f"Chưa build subset {split} ({npz}) — chạy `python -m experiments build --split {split}`.")
    data = np.load(npz, allow_pickle=False)
    classes = json.loads((base / "classes.json").read_text())["classes"]
    built_hash = str(data["mapping_hash"])
    if built_hash != mapping_hash(classes):
        raise SystemExit(f"subset/{split}.npz build từ mapping khác classes.json — chạy lại build.")
    boxes_path, caps_path = base / f"{split}_boxes.json", base / f"{split}_captions.json"
    subset = OISubset(
        split=split, image_ids=[str(i) for i in data["image_ids"]], Y=data["Y"], classes=classes,
        root=Path(data_root), sizes=data["sizes"],
        boxes=json.loads(boxes_path.read_text()) if boxes_path.exists() else {},
        captions=json.loads(caps_path.read_text()) if caps_path.exists() else {},
    )
    return subset.take(smoke) if smoke else subset


# ── Build ─────────────────────────────────────────────────────────────────
def check_image(path: Path) -> tuple[str, tuple[int, int] | None]:
    """→ ("ok" | "missing" | "broken" | "exif_rotated", (w, h))."""
    from PIL import Image

    if not path.exists():
        return "missing", None
    try:
        with Image.open(path) as im:
            orientation = im.getexif().get(274, 1)
            size = im.size
            im.verify()
    except Exception:  # noqa: BLE001 — ảnh hỏng
        return "broken", None
    if orientation not in (0, 1):
        return "exif_rotated", size
    return "ok", size


def stream_boxes(data_root: Path, split: str, ids: set[str], classes: list[dict], progress=None) -> dict:
    """ImageID → [[c, x1, y1, x2, y2, is_group]] (0–1), box lớp con tính cho lớp cha."""
    targets: dict[str, list[int]] = {}
    for j, c in enumerate(classes):
        for mid in [c["oi_mid"], *c["descendants"]]:
            targets.setdefault(mid, []).append(j)
    out: dict[str, list] = {}
    path = find_file(data_root, ("boxes", split))
    with open(path, newline="", encoding="utf-8") as fh:
        for n, row in enumerate(csv.DictReader(fh)):
            if progress and n % 500_000 == 0:
                progress(f"đọc {path.name}: {n:,} dòng")
            if row["ImageID"] not in ids or row["LabelName"] not in targets:
                continue
            box = [float(row["XMin"]), float(row["YMin"]), float(row["XMax"]), float(row["YMax"])]
            group = int(float(row.get("IsGroupOf") or 0) == 1)
            for j in targets[row["LabelName"]]:
                out.setdefault(row["ImageID"], []).append([j, *box, group])
    for k, v in out.items():  # bỏ trùng (lớp con + chính nó cùng map vào 1 lớp)
        out[k] = [list(t) for t in dict.fromkeys(tuple(b) for b in v)]
    return out


_ID_RE = re.compile(r'"image_id"\s*:\s*"([^"]+)"')


def stream_narratives(data_root: Path, split: str, ids: set[str], progress=None) -> dict[str, list[str]]:
    path = find_file(data_root, ("narratives", split), required=False)
    if path is None:
        return {}
    out: dict[str, list[str]] = {}
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh):
            if progress and n % 100_000 == 0:
                progress(f"đọc {path.name}: {n:,} dòng")
            m = _ID_RE.search(line[:400])
            if not m or m.group(1) not in ids:
                continue
            caption = json.loads(line).get("caption", "").strip()
            if caption:
                out.setdefault(m.group(1), []).append(caption)
    return out


def save_classes(data_root: Path, classes: list[dict]) -> None:
    write_json(subset_dir(data_root) / "classes.json",
               {"mapping_hash": mapping_hash(classes), "classes": classes})
