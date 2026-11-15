"""Part 0 — chuẩn bị subset Open Images (không tải gì: chỉ đọc file bạn đã tải).

  select   mapping lớp → MID, đọc nhãn người xác minh, chọn N ảnh/split
           → subset/<split>_ids.txt + download_<split>.txt (cho downloader.py chính thức)
  build    sau khi tải ảnh: kiểm ảnh (thiếu / hỏng / xoay EXIF), dựng Y {1,0,-1},
           box (group-of, mở rộng theo cây lớp), caption Localized Narratives
  status   file nào đã có / còn thiếu cho từng thí nghiệm
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from experiments import oi_data
from experiments.core import CommonParams, Run, opt, write_json


# ── select ────────────────────────────────────────────────────────────────
@dataclass
class SelectParams(CommonParams):
    splits: list[str] = opt(["validation", "test"], "Split chính thức của Open Images (thêm `train` để train "
                            "probe / fusion / YOLO — không đụng tới val/test đã chọn).",
                            choices=list(oi_data.SPLITS))
    n_train: int = opt(15000, "Số ảnh train.")
    n_validation: int = opt(3000, "Số ảnh val (chọn prompt / ngưỡng / quy tắc).")
    n_test: int = opt(5000, "Số ảnh test (báo cáo 1 lần).")
    min_pos_train: int = opt(100, "Mỗi lớp cố gắng có ≥ N ảnh positive trong train.")
    min_pos_validation: int = opt(30, "Mỗi lớp cố gắng có ≥ N ảnh positive trong val.")
    min_pos_test: int = opt(50, "Mỗi lớp cố gắng có ≥ N ảnh positive trong test.")
    train_pool_fraction: float = opt(0.25, "Train: chỉ xét ngẫu nhiên (theo hash ImageID) tỉ lệ này của ảnh "
                                     "boxable làm ứng viên — 1.0 = tất cả (~1,7 triệu, chậm + tốn RAM).")
    train_boxable_only: bool = opt(True, "Train: chỉ chọn ảnh có trong train-images-boxable-with-rotation.csv "
                                   "(ảnh có box → dùng được cho fine-tune YOLO ở E4).")
    mapping: str = opt(str(oi_data.DEFAULT_MAPPING), "CSV mapping lớp.")
    exclude_rotated: bool = opt(True, "Loại ảnh có Rotation ≠ 0 trong *-images-with-rotation.csv.")
    seed: int = opt(0, "Seed chọn ảnh.")


def run_select(p: SelectParams) -> dict:
    with Run("select", p) as run:
        run.stage("resolve lớp")
        classes = oi_data.resolve_classes(p.root, Path(p.mapping))
        oi_data.save_classes(p.root, classes)
        n_obj = sum(c["group"] == "object" for c in classes)
        n_yolo = sum(bool(c.get("coco")) for c in classes)
        run.log(f"  {len(classes)} lớp ({n_obj} object · {len(classes) - n_obj} scene · {n_yolo} có lớp YOLO)")
        mids = oi_data.relevant_mids(classes)
        out_dir = oi_data.subset_dir(p.root)
        summary = {"classes": len(classes), "splits": {}}
        for split in p.splits:
            keep_id = None
            listed, rotated = oi_data.read_image_list(p.root, split)
            if split == "train":
                oi_data.find_file(p.root, ("labels", "train"))  # báo thiếu file sớm, trước khi đọc gì khác
                if p.train_boxable_only and not listed:
                    oi_data.find_file(p.root, ("images", "train"))  # → SystemExit kèm tên file cần tải
                frac = p.train_pool_fraction

                def keep_id(i: str, listed=listed, frac=frac) -> bool:
                    return (not p.train_boxable_only or i in listed) and (frac >= 1.0 or oi_data.hash_fraction(i) < frac)

                run.log(f"  train: ứng viên = {'ảnh boxable' if p.train_boxable_only else 'mọi ảnh'}"
                        f"{f' ({len(listed):,})' if p.train_boxable_only else ''} × {frac:.0%} theo hash")
            run.stage(f"{split}: đọc nhãn người xác minh")
            labels = oi_data.stream_image_labels(p.root, split, mids, progress=run.log, keep_id=keep_id)
            exclude = rotated if p.exclude_rotated else set()
            n = p.smoke or {"train": p.n_train, "validation": p.n_validation, "test": p.n_test}[split]
            min_pos = {"train": p.min_pos_train, "validation": p.min_pos_validation, "test": p.min_pos_test}[split]
            run.stage(f"{split}: chọn {n} ảnh")
            ids, Y = oi_data.select_subset(labels, classes, n, min_pos, exclude, p.seed)
            (out_dir / f"{split}_ids.txt").write_text("\n".join(ids) + "\n")
            (out_dir / f"download_{split}.txt").write_text("".join(f"{split}/{i}\n" for i in ids))
            per_class = [{"class": c["oi_name"], "group": c["group"],
                          "pos": int((Y[:, j] == 1).sum()), "neg": int((Y[:, j] == 0).sum()),
                          "unknown": int((Y[:, j] == -1).sum())} for j, c in enumerate(classes)]
            weak = [r["class"] for r in per_class if r["pos"] < min_pos / 2]
            pos = np.array([r["pos"] for r in per_class])
            info = {"candidates": len(labels), "excluded_rotated": len(exclude & set(labels)),
                    "selected": len(ids), "min_pos": min_pos, "median_pos": float(np.median(pos)),
                    "p10_pos": float(np.percentile(pos, 10)), "classes_below_half_min_pos": weak}
            write_json(out_dir / f"{split}_selection.json", {**info, "per_class": per_class})
            run.table(f"{split}_selection", per_class)
            run.log(f"  {split}: {len(ids)} ảnh · positive/lớp: trung vị {info['median_pos']:.0f}, "
                    f"p10 {info['p10_pos']:.0f} · {len(weak)} lớp < {min_pos // 2}"
                    + (f" ({', '.join(weak[:10])}{'…' if len(weak) > 10 else ''})" if weak else ""))
            run.log(f"  → tải ảnh theo {out_dir / f'download_{split}.txt'} (README Part 0)")
            summary["splits"][split] = info
        run.summary = summary
    return summary


# ── build ─────────────────────────────────────────────────────────────────
@dataclass
class BuildParams(CommonParams):
    splits: list[str] = opt(["validation", "test"], "Split cần build.")
    allow_missing: bool = opt(False, "Cho phép thiếu ảnh (bỏ ảnh thiếu thay vì dừng).")
    workers: int = opt(8, "Luồng kiểm tra ảnh.")


def run_build(p: BuildParams) -> dict:
    with Run("build", p) as run:
        out_dir = oi_data.subset_dir(p.root)
        classes_path = out_dir / "classes.json"
        if not classes_path.exists():
            raise SystemExit("Chưa có subset/classes.json — chạy `python -m experiments select` trước.")
        classes = json.loads(classes_path.read_text())["classes"]
        mids = oi_data.relevant_mids(classes)
        summary = {"splits": {}}
        for split in p.splits:
            ids_path = out_dir / f"{split}_ids.txt"
            if not ids_path.exists():
                raise SystemExit(f"Thiếu {ids_path} — chạy select cho split {split}.")
            ids = [i for i in ids_path.read_text().split() if i]
            if p.smoke:
                ids = ids[: p.smoke]
            run.stage(f"{split}: kiểm tra {len(ids)} ảnh")
            img_dir = oi_data.images_dir(p.root, split)
            results = []
            with ThreadPoolExecutor(max_workers=p.workers) as pool:
                for k, r in enumerate(pool.map(lambda i: oi_data.check_image(img_dir / f"{i}.jpg"), ids)):
                    results.append(r)
                    run.progress(k + 1, len(ids), "ảnh")
            status = {s: [i for i, (st, _) in zip(ids, results) if st == s]
                      for s in ("ok", "missing", "broken", "exif_rotated")}
            if status["missing"] or status["broken"]:
                bad = status["missing"] + status["broken"]
                (out_dir / f"missing_{split}.txt").write_text("".join(f"{split}/{i}\n" for i in bad))
                msg = (f"{split}: thiếu {len(status['missing'])} · hỏng {len(status['broken'])} ảnh "
                       f"→ {out_dir / f'missing_{split}.txt'} (tải lại bằng downloader.py)")
                if not p.allow_missing:
                    raise SystemExit(msg + " — hoặc chạy lại với --allow-missing.")
                run.log("  ! " + msg)
            keep = [i for i, (st, _) in zip(ids, results) if st == "ok"]
            sizes = np.asarray([r[1] for r in results if r[0] == "ok"], dtype=np.int32).reshape(-1, 2)
            keep_set = set(keep)

            run.stage(f"{split}: nhãn image-level")
            labels = oi_data.stream_image_labels(p.root, split, mids, keep_set, progress=run.log)
            Y = np.stack([oi_data.derive_labels(labels.get(i, {}), classes) for i in keep]) if keep \
                else np.zeros((0, len(classes)), np.int8)

            run.stage(f"{split}: box")
            boxes = oi_data.stream_boxes(p.root, split, keep_set, classes, progress=run.log)
            run.stage(f"{split}: Localized Narratives")
            captions = oi_data.stream_narratives(p.root, split, keep_set, progress=run.log)

            np.savez_compressed(out_dir / f"{split}.npz", image_ids=np.array(keep), Y=Y, sizes=sizes,
                                mapping_hash=np.array(oi_data.mapping_hash(classes)))
            write_json(out_dir / f"{split}_boxes.json", boxes)
            write_json(out_dir / f"{split}_captions.json", captions)
            info = {
                "images": len(keep), "missing": len(status["missing"]), "broken": len(status["broken"]),
                "exif_rotated_excluded": len(status["exif_rotated"]),
                "known_pairs": int((Y != -1).sum()), "positive_pairs": int((Y == 1).sum()),
                "images_with_boxes": len(boxes),
                "group_of_boxes": sum(b[5] for v in boxes.values() for b in v),
                "images_with_captions": len(captions),
            }
            write_json(out_dir / f"{split}_build.json", info)
            run.log(f"  {split}: {info}")
            summary["splits"][split] = info
        run.summary = summary
    return summary


# ── status ────────────────────────────────────────────────────────────────
NEEDS = {
    "select": ["classes", "classes_boxable", "hierarchy", "labels/validation", "labels/test"],
    "build": ["boxes/validation", "boxes/test", "subset ids", "images"],
    "e1": ["clip_benchmark/flickr30k", "clip_benchmark/mscoco_captions"],
    "e2": ["subset validation", "subset test"],
    "e3": ["subset test", "narratives (b)", "queries.csv (c)", "uit-openviic (d)"],
    "e4": ["subset validation", "subset test", "boxes"],
    "e5": ["run e2", "run e4"],
    "probe": ["subset train (select/build --splits train)", "run e2", "run e5", "DINOv3 weights"],
    "e6": ["run e2", "run e4", "run e5", "narratives", "(tuỳ chọn) run probe"],
}


def status(p: CommonParams) -> dict:
    from experiments.core import find_run, result_root

    root = p.root
    files = oi_data.file_status(root)
    sub = oi_data.subset_dir(root)
    subset = {}
    for split in oi_data.SPLITS:
        info = sub / f"{split}_build.json"
        subset[split] = {
            "selected": (sub / f"{split}_ids.txt").exists(),
            "built": (sub / f"{split}.npz").exists(),
            "images_downloaded": len(list(oi_data.images_dir(root, split).glob("*.jpg")))
            if oi_data.images_dir(root, split).exists() else 0,
            "build": json.loads(info.read_text()) if info.exists() else None,
        }
    from bench.common import data_dir, history_dir

    clip_bench = {name: (data_dir(root, "clip_benchmark") / name / "test").exists()
                  for name in ("flickr30k", "mscoco_captions")}
    runs = {}
    for exp in ("select", "build", "e1", "e2", "e3", "e4", "e5", "probe", "e6"):
        try:
            runs[exp] = find_run(root, exp).name
        except SystemExit:
            runs[exp] = None
    from experiments.e3_search import QUERIES_PATH, openviic_root

    return {"data_root": str(root), "annotations": files, "subset": subset,
            "clip_benchmark": clip_bench, "queries_csv": QUERIES_PATH.exists(),
            "uit_openviic": openviic_root(root).exists(), "latest_runs": runs,
            "results": str(result_root(root)), "history": str(history_dir(root)), "needs": NEEDS}
