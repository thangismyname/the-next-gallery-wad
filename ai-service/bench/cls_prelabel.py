"""Tự gán nhãn NHÁP (pre-label) cho ảnh của bạn → labels.json để duyệt lại bằng UI.

Model chạy trước, người duyệt sau: ground-truth nhanh hơn nhiều so với gán từ đầu.

    $TNG_DATASETS/gallery-gt/images/**      ← chép ảnh của bạn vào đây (thư mục con tuỳ ý)
    $TNG_DATASETS/gallery-gt/labels.json    ← script tạo / cập nhật

Mỗi ảnh trong labels.json:
    predicted   xác suất của cả 17 tag (từ hệ thống tốt nhất đã train; chưa train → zero-shot)
    suggested   các tag có xác suất ≥ ngưỡng của tag đó
    labels      NHÃN THẬT — ban đầu = suggested; người duyệt sửa trong UI
    status      "auto" (chưa duyệt) | "reviewed" (đã duyệt → dùng làm GT) | "skipped"
    objects     detection YOLO (class, confidence, bbox 0–1) — để UI vẽ box tham khảo

Chạy lại an toàn: ảnh "reviewed"/"skipped" giữ nguyên labels/status/notes (chỉ cập nhật
predicted/suggested); ảnh bị sửa nội dung (sha256 đổi) quay về "auto"; ảnh mới được thêm.

Usage (từ ai-service/):
    uv run python -m bench.cls_prelabel                 # dùng model trong bench/runs/cls/
    uv run python -m bench.cls_prelabel --system zs_clip
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from bench.cls_data import ClsDataset, gallery_root
from bench.cls_eval import SYSTEM_CONFIG, TagSystem
from bench.cls_features import cache_dir, load_features
from bench.cls_taxonomy import TAG_IDS, TAGS, TAXONOMY_VERSION
from bench.common import DEFAULT_DATA_ROOT, utc_now

SCHEMA = 1
# Pillow không đọc HEIC (ảnh iPhone) — xuất/chuyển sang JPEG trước khi chép vào.
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
KEEP_STATUSES = {"reviewed", "skipped"}
OBJECT_MIN_CONF = 0.4  # = AI_YOLO_MIN_CONF


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_images(folder: Path) -> list[str]:
    return sorted(
        str(p.relative_to(folder)) for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and not p.name.startswith(".")
    )


def merge_entry(old: dict | None, new: dict) -> dict:
    """Giữ quyết định của người duyệt; chỉ làm mới phần dự đoán."""
    if old is None:
        return new
    if old.get("sha256") != new["sha256"]:
        print(f"  ! {new['file']} đã đổi nội dung → về trạng thái auto", flush=True)
        return new
    if old.get("status") in KEEP_STATUSES:
        return {**new, "labels": old.get("labels") or [], "status": old["status"],
                "notes": old.get("notes", ""), "reviewed_at": old.get("reviewed_at")}
    return {**new, "notes": old.get("notes", "")}


def main() -> int:
    parser = argparse.ArgumentParser(description="Gán nhãn nháp cho ảnh gallery của bạn.")
    parser.add_argument("--system", default=SYSTEM_CONFIG,
                        help="best (mặc định: tốt nhất theo val cho từng nhóm tag) | lp_all | zs_clip …")
    parser.add_argument("--image-preprocess", default="backend", choices=["backend", "raw"])
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    args = parser.parse_args()

    root = gallery_root(args.data_root)
    images_dir = root / "images"
    files = find_images(images_dir) if images_dir.exists() else []
    if not files:
        raise SystemExit(f"Chưa có ảnh trong {images_dir} — chép ảnh của bạn vào đó rồi chạy lại.")
    print(f"{len(files)} ảnh trong {images_dir}", flush=True)

    ds = ClsDataset("gallery", root, [f"images/{f}" for f in files], list(TAG_IDS),
                    np.zeros((len(files), len(TAG_IDS)), dtype=bool), np.array(["test"] * len(files)))
    system = TagSystem(args.system, args.device)
    kinds = sorted(set(system.features) | {"yolo"})  # yolo luôn chạy để có box cho UI
    feats = {k: load_features(ds, k, args.data_root, args.image_preprocess, args.device,
                              args.batch_size, args.workers) for k in kinds}
    P, thr = system.predict(feats)
    det_file = cache_dir(args.data_root, "gallery") / f"yolo-{args.image_preprocess}-detections.json"
    detections = json.loads(det_file.read_text()) if det_file.exists() else {}

    labels_file = root / "labels.json"
    old_doc = json.loads(labels_file.read_text()) if labels_file.exists() else {"images": []}
    old_by_file = {e["file"]: e for e in old_doc.get("images", [])}
    if old_doc.get("taxonomy_version") not in (None, TAXONOMY_VERSION):
        print(f"  ! labels.json dùng taxonomy {old_doc['taxonomy_version']} ≠ {TAXONOMY_VERSION} "
              "— nhãn đã duyệt được giữ, kiểm tra lại các tag đã đổi", flush=True)

    entries, counts = [], {"new": 0, "kept": 0, "updated": 0}
    for i, rel in enumerate(files):
        path = images_dir / rel
        suggested = [t for j, t in enumerate(TAG_IDS) if P[i, j] >= thr[j]]
        new = {
            "file": rel, "sha256": sha256(path),
            "predicted": {t: round(float(P[i, j]), 4) for j, t in enumerate(TAG_IDS)},
            "suggested": suggested, "labels": suggested, "status": "auto",
            "objects": [d for d in detections.get(f"images/{rel}", []) if d["confidence"] >= OBJECT_MIN_CONF],
            "notes": "", "reviewed_at": None,
        }
        old = old_by_file.pop(rel, None)
        entry = merge_entry(old, new)
        counts["new" if old is None else "kept" if entry["status"] in KEEP_STATUSES else "updated"] += 1
        entries.append(entry)
    if old_by_file:
        print(f"  ! bỏ {len(old_by_file)} mục không còn file ảnh: {list(old_by_file)[:3]}…", flush=True)

    doc = {
        "schema": SCHEMA, "taxonomy_version": TAXONOMY_VERSION, "updated": utc_now(),
        "tags": [{k: t[k] for k in ("id", "vi", "en", "group", "definition")} for t in TAGS],
        "model": {
            "system": args.system, "image_preprocess": args.image_preprocess,
            "parts": [{"tags": tags, "source": src} for tags, _, src in system.parts],
            "thresholds": {t: round(float(thr[j]), 4) for j, t in enumerate(TAG_IDS)},
        },
        "images": entries,
    }
    tmp = labels_file.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    tmp.replace(labels_file)  # ghi nguyên tử — không làm hỏng file đang duyệt dở

    reviewed = sum(e["status"] == "reviewed" for e in entries)
    tag_counts = {t: sum(t in e["suggested"] for e in entries) for t in TAG_IDS}
    print(f"→ {labels_file}\n  mới {counts['new']} · giữ nhãn đã duyệt {counts['kept']} · "
          f"cập nhật {counts['updated']} · đã duyệt {reviewed}/{len(entries)}")
    print("  gợi ý: " + ", ".join(f"{t}={n}" for t, n in tag_counts.items() if n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
