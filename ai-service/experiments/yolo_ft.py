"""YOLO-FT — fine-tune YOLO26n (pretrain COCO) trên box Open Images: bản CÓ TRAIN của E4 (form §6).

Câu hỏi:
  1. Lấp khoảng trống: YOLO COCO chỉ biết 81/174 lớp — sau fine-tune, 47 lớp vật thể ngoài COCO
     (Tree, Flower, Building, Footwear, Sunglasses, …) detect / gắn tag được tới đâu?
  2. Có quên không: trên 81 lớp COCO, model fine-tune so với model gốc thế nào (cùng giao thức OI)?
  3. Chi phí: mAP@50 / mAP@50-95, latency, số tham số, kích thước file (yêu cầu §6 của form).

Dữ liệu: 128 lớp vật thể (boxable) của mapping. Box từ `build` (box lớp con tính cho lớp cha, vd Van → Car;
box group-of giữ là 1 box). Train = split train, chọn epoch tốt nhất trên val (Ultralytics), test chỉ đánh giá.
Chỉ ảnh có ≥1 box được đưa vào Ultralytics: Open Images chỉ vẽ box cho lớp đã xác minh có trong ảnh,
nên ảnh không box có thể vẫn chứa vật thể → dùng làm "nền" sẽ dạy sai.

Ảnh được symlink (không copy) thành layout Ultralytics:
    $TNG_DATASETS/Data/open-images-yolo/{images,labels}/{train,val,test}/<ImageID>.{jpg,txt} + data.yaml

Đánh giá:
  * Ultralytics `val` trên test (128 lớp): mAP@50, mAP@50-95, tốc độ — số chuẩn để báo cáo §6.
  * Giao thức Open Images giống E4 (AP@0.5, box group-of, chỉ ảnh đã xác minh) cho CẢ model gốc (81 lớp)
    và model fine-tune → so trực tiếp trên 81 lớp COCO + số mới trên 47 lớp ngoài COCO.
  * Tag image-level (conf lớn nhất mỗi lớp; ngưỡng chọn trên val, max-F1 và precision ≥ target) → mAP, F1,
    bootstrap ghép cặp (fine-tune − gốc) trên 81 lớp COCO.
  * Latency: cùng pipeline app (ảnh backend ≤1280 JPEG → provider.detect), đo trên N ảnh test.

`--pseudo-label`: train trên box người + box giả của YOLO gốc cho lớp COCO chưa xác minh (xem
experiments/pseudo_label.py) — chống "quên" do Open Images thiếu box. Dataset ghi vào Data/open-images-yolo-pl/
(không đè bản thường); chỉ split train có box giả, cùng tập ảnh với bản thường → so sánh sạch. Ablation:
  yolo_ft                              fine-tune thường (run 20261108-021431)
  yolo_ft --pseudo-label               + nhãn giả                → tác dụng của nhãn giả
  yolo_ft --pseudo-label --freeze 10   + nhãn giả + đóng băng backbone → tác dụng của freeze

`best.pt` được chép thành `models/yolo26n-oi-<run_id>.pt` (git-ignore) để app / probe dùng lại.
"""
from __future__ import annotations

import csv
import json
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from bench.common import MODELS_DIR, data_dir
from experiments import metrics as M
from experiments import pseudo_label as PL
from experiments.core import CommonParams, Run, find_run, opt
from experiments.e4_yolo import detection_eval
from experiments.features import APP_CLIP, APP_YOLO, prepare_bytes, yolo_detections, yolo_provider
from experiments.oi_data import OISubset, load_subset

YOLO_SPLITS = (("train", "train"), ("validation", "val"), ("test", "test"))  # split OI → tên thư mục Ultralytics


@dataclass
class YoloFTParams(CommonParams):
    base: str = opt(APP_YOLO, "Weights khởi đầu (pretrain COCO, models/<tên>).")
    epochs: int = opt(30, "Số epoch tối đa.")
    patience: int = opt(10, "Dừng sớm nếu val mAP không tăng sau N epoch.")
    imgsz: int = opt(640, "Kích thước ảnh train / detect (= AI_YOLO_IMGSZ).")
    batch: int = opt(16, "Batch size (giảm nếu hết bộ nhớ).")
    freeze: int = opt(0, "Đóng băng N layer đầu (backbone) — nhanh hơn, ít quên hơn; 0 = train toàn mạng.")
    pseudo_label: bool = opt(False, "Thêm box giả của YOLO gốc cho lớp COCO chưa xác minh trong ảnh train.")
    pseudo_precision: float = opt(0.9, "Precision box tối thiểu (đo trên val, giao thức OI) khi chọn ngưỡng box giả / lớp.")
    pseudo_min_tp: int = opt(10, "Lớp cần ≥ N box đúng trên val tại ngưỡng mới được gắn box giả.")
    pseudo_overlap_iou: float = opt(0.7, "Box giả trùng box lớp khác (IoU ≥) → bỏ, trừ cặp trong pseudo_overlap_allowed.csv.")
    pseudo_clip_min: float = opt(0.7, "Box có nhiều lớp đích (cup → Mug / Coffee cup): CLIP trên vùng cắt phải ≥ ngưỡng này.")
    pseudo_clip: str = opt(APP_CLIP, "CLIP dùng phân định box nhiều lớp đích.")
    optimizer: str = opt("auto", "Optimizer Ultralytics (auto | SGD | AdamW …).")
    fraction: float = opt(1.0, "Tỉ lệ ảnh train dùng (thử nhanh).")
    workers: int = opt(8, "Luồng dataloader.")
    seed: int = opt(0, "Seed train.")
    resume: str = opt("", "Run id yolo_ft bị dừng giữa chừng (tắt máy…) → train tiếp từ train/weights/last.pt, "
                          "ghi vào đúng thư mục run đó. Truyền lại các tham số như lần đầu (--pseudo-label, --freeze…).")
    eval_only: bool = opt(False, "Bỏ train, chỉ đánh giá `--weights` (hoặc best.pt của run yolo_ft mới nhất).")
    weights: str = opt("", "Weights fine-tune cần đánh giá khi --eval-only (models/<tên> hoặc path).")
    conf: float = opt(0.001, "Ngưỡng conf khi detect để đánh giá (thấp để tính mAP, giống E4).")
    iou: float = opt(0.5, "Ngưỡng IoU khớp box (giao thức OI).")
    preprocess: str = opt("backend", "Tiền xử lý ảnh khi đánh giá theo pipeline app.", choices=["backend", "raw"])
    precision_target: float = opt(0.9, "Precision tối thiểu khi chọn ngưỡng tag (= E5).")
    latency_images: int = opt(200, "Số ảnh test đo latency (0 = bỏ).")
    bootstrap: int = opt(300, "Bootstrap ghép cặp (0 = tắt).")


# ── dữ liệu Ultralytics ───────────────────────────────────────────────────
def object_classes(classes: list[dict]) -> list[int]:
    """Chỉ số (trong mapping) của lớp vật thể có box → thứ tự lớp của model fine-tune."""
    return [j for j, c in enumerate(classes) if c["group"] == "object" and c.get("boxable")]


def yolo_label_lines(boxes: list, class_index: dict[int, int]) -> list[str]:
    """[[c, x1, y1, x2, y2, group], …] (0–1) → dòng YOLO "k xc yc w h" (bỏ lớp không train, box suy biến)."""
    lines = []
    for c, x1, y1, x2, y2, _ in boxes:
        k = class_index.get(int(c))
        x1, y1, x2, y2 = (min(max(v, 0.0), 1.0) for v in (x1, y1, x2, y2))
        w, h = x2 - x1, y2 - y1
        if k is None or w <= 0 or h <= 0:
            continue
        lines.append(f"{k} {(x1 + x2) / 2:.6f} {(y1 + y2) / 2:.6f} {w:.6f} {h:.6f}")
    return lines


def export_dataset(out: Path, subsets: dict[str, OISubset], obj: list[int]) -> tuple[Path, dict]:
    """Symlink ảnh + ghi label → data.yaml. Idempotent (label ghi lại mỗi lần, symlink giữ nguyên)."""
    class_index = {j: k for k, j in enumerate(obj)}
    stats = {}
    for oi_split, ysplit in YOLO_SPLITS:
        sub = subsets[oi_split]
        img_dir, lab_dir = out / "images" / ysplit, out / "labels" / ysplit
        if lab_dir.exists():
            shutil.rmtree(lab_dir)  # bỏ label cũ (subset / mapping có thể đổi)
        img_dir.mkdir(parents=True, exist_ok=True)
        lab_dir.mkdir(parents=True, exist_ok=True)
        keep = set()
        n_boxes = 0
        for img, src in zip(sub.image_ids, sub.paths()):
            lines = yolo_label_lines(sub.boxes.get(img, []), class_index)
            if not lines:
                continue
            link = img_dir / f"{img}.jpg"
            if not link.exists():
                link.symlink_to(os.path.relpath(src, img_dir))
            (lab_dir / f"{img}.txt").write_text("\n".join(lines) + "\n")
            keep.add(img)
            n_boxes += len(lines)
        for link in img_dir.glob("*.jpg"):  # ảnh của subset cũ
            if link.stem not in keep:
                link.unlink()
        stats[ysplit] = {"images": len(keep), "boxes": n_boxes}
    names = [subsets["train"].classes[j]["oi_name"] for j in obj]
    yaml = out / "data.yaml"
    yaml.write_text("\n".join([f"path: {out}", "train: images/train", "val: images/val", "test: images/test",
                               f"nc: {len(names)}", "names:"] + [f"  {k}: {n!r}" for k, n in enumerate(names)]) + "\n")
    return yaml, stats


def make_pseudo_labels(p: YoloFTParams, run: Run, subsets: dict[str, OISubset], obj: list[int]):
    """Box giả cho split train (xem pseudo_label.py) → (subset train đã gộp box, tóm tắt)."""
    train, val = subsets["train"], subsets["validation"]
    classes = train.classes
    run.stage("nhãn giả: detect val/train bằng YOLO gốc")
    dets = {name: yolo_detections(sub.name, sub.image_ids, sub.paths(), p.root, p.base, p.conf, p.imgsz,
                                  p.preprocess, p.device, run=run) for name, sub in (("val", val), ("train", train))}
    targets = PL.coco_targets(classes, obj)
    names = {c["oi_name"] for c in classes}
    allowed = {pair for pair in PL.read_overlap_allowed() if pair <= names}  # tên khớp mapping: test_pseudo_label

    run.stage(f"nhãn giả: ngưỡng box theo lớp (precision ≥ {p.pseudo_precision} trên val)")
    thr = PL.box_thresholds(val, dets["val"], targets, p.pseudo_precision, p.pseudo_min_tp, p.iou)
    reached = [k for k, r in thr.items() if r["reached"]]
    run.log(f"  {len(reached)} / {len(thr)} lớp COCO đạt precision ≥ {p.pseudo_precision} với ≥ {p.pseudo_min_tp} box đúng")

    run.stage("nhãn giả: gắn box cho train")
    class_index = {j: k for k, j in enumerate(obj)}
    keep = {img for img in train.image_ids if yolo_label_lines(train.boxes.get(img, []), class_index)}
    res = PL.pseudo_boxes(train, dets["train"], targets, thr, allowed, p.pseudo_overlap_iou, only_ids=keep)
    run.log(f"  {sum(map(len, res.boxes.values()))} box giả · {len(res.ambiguous)} box nhiều lớp đích → CLIP")
    clip_rows = PL.resolve_with_clip(res, train, p.pseudo_clip, p.device, p.pseudo_clip_min, allowed,
                                     p.pseudo_overlap_iou, run=run)
    if clip_rows:
        run.table("pseudo_clip", clip_rows)

    added = {j: 0 for j in obj}
    for bs in res.boxes.values():
        for b in bs:
            added[int(b[0])] += 1
    human = {j: 0 for j in obj}
    for img in keep:
        for b in train.boxes.get(img, []):
            if int(b[0]) in human:
                human[int(b[0])] += 1
    rows = []
    for k, T in targets.items():
        r = thr[k]
        for j in T:
            rows.append({"coco": k, "class": classes[j]["oi_name"], "threshold": r["threshold"],
                         "val_precision": r["precision"], "val_recall": r["recall"], "val_tp": r["tp"],
                         "reached": r["reached"], "human_boxes": human[j], "pseudo_boxes": added[j],
                         "pseudo_share": added[j] / max(added[j] + human[j], 1)})
    run.table("pseudo_labels", rows)
    total = sum(added.values())
    summary = {"precision_target": p.pseudo_precision, "classes_reached": len(reached), "coco_classes": len(thr),
               "pseudo_boxes": total, "images_with_pseudo": len(res.boxes),
               "human_boxes": sum(human.values()), "clip_resolved": sum(r["accepted"] for r in clip_rows),
               "clip_rejected": sum(not r["accepted"] for r in clip_rows), "skipped": res.skipped}
    run.log(f"  → {total} box giả trên {len(res.boxes)} ảnh (box người: {summary['human_boxes']}) · bỏ: "
            + ", ".join(f"{k} {v}" for k, v in res.skipped.items()))
    return PL.merge_boxes(train, res.boxes), summary


# ── đánh giá ──────────────────────────────────────────────────────────────
def image_scores_by_name(subset: OISubset, dets: dict, names: dict[int, str]) -> np.ndarray:
    """(N, C): conf lớn nhất của detection có class_name == names[c]; lớp không có trong `names` = 0."""
    by_name: dict[str, list[int]] = {}
    for j, n in names.items():
        by_name.setdefault(n, []).append(j)
    S = np.zeros((len(subset.image_ids), len(subset.classes)), dtype=np.float32)
    for i, img in enumerate(subset.image_ids):
        for d in dets.get(img, []):
            for j in by_name.get(d["class_name"], ()):
                S[i, j] = max(S[i, j], d["confidence"])
    return S


def tune(Sv: np.ndarray, Yv: np.ndarray, cols: list[int], precision_target: float):
    free, strict = np.full(Yv.shape[1], np.inf), np.full(Yv.shape[1], np.inf)
    for c in cols:
        m = M.known(Yv, c)
        free[c] = M.tune_threshold(Sv[m, c], Yv[m, c] == 1)["threshold"]
        strict[c] = M.tune_threshold(Sv[m, c], Yv[m, c] == 1, precision_target)["threshold"]
    return free, strict


def measure_latency(weights: str, paths: list[Path], imgsz: int, preprocess: str, device: str) -> dict:
    model = yolo_provider(weights, 0.25, imgsz, device)
    blobs = [prepare_bytes(p, "yolo", preprocess) for p in paths]
    for b in blobs[:10]:  # warm-up
        model.detect(b)
    t0 = time.perf_counter()
    for b in blobs:
        model.detect(b)
    ms = 1000 * (time.perf_counter() - t0) / max(len(blobs), 1)
    path = MODELS_DIR / weights if (MODELS_DIR / weights).exists() else Path(weights)
    return {"ms_per_image": ms, "images": len(blobs),
            "params_m": sum(p.numel() for p in model._model.model.parameters()) / 1e6,
            "file_mb": path.stat().st_size / 1e6 if path.exists() else None}


def train_csv_seconds(run_dir: Path) -> float:
    """Thời gian train đã ghi ở dòng cuối train/results.csv (cột `time`, giây từ lúc bắt đầu train)."""
    path = run_dir / "train" / "results.csv"
    try:
        rows = list(csv.DictReader(path.open()))
        return float(rows[-1]["time"]) if rows and "time" in rows[-1] else 0.0
    except (OSError, ValueError, KeyError):
        return 0.0


def resolve_device(device: str) -> str:
    if device and device != "auto":
        return device
    import torch

    if torch.cuda.is_available():
        return "0"
    return "mps" if torch.backends.mps.is_available() else "cpu"


def run(p: YoloFTParams) -> dict:
    with Run("yolo_ft", p, resume=p.resume) as run:
        run.stage("load subset")
        subsets = {s: load_subset(p.root, s, p.smoke) for s, _ in YOLO_SPLITS}
        val, test = subsets["validation"], subsets["test"]
        classes = val.classes
        obj = object_classes(classes)
        coco_cols = [j for j in obj if classes[j].get("coco")]
        gap_cols = [j for j in obj if not classes[j].get("coco")]
        run.log(f"  {len(obj)} lớp vật thể có box ({len(coco_cols)} có trong COCO · {len(gap_cols)} ngoài COCO)")
        device = resolve_device(p.device)
        summary: dict = {"classes": len(obj), "coco_classes": len(coco_cols), "gap_classes": len(gap_cols),
                         "device": device}

        # ── train ──────────────────────────────────────────────────────────
        if p.eval_only:
            if p.weights:
                ft_name = p.weights
            else:
                prev = find_run(p.root, "yolo_ft", "", run.smoke)
                ft_name = json.loads((prev / "artifacts" / "model.json").read_text())["models_file"]
            run.log(f"  --eval-only: đánh giá {ft_name}")
        else:
            if p.pseudo_label:
                subsets["train"], summary["pseudo"] = make_pseudo_labels(p, run, subsets, obj)
            run.stage("xuất dataset Ultralytics")
            out = data_dir(p.root, "open-images-yolo" + ("-pl" if p.pseudo_label else "") + ("-smoke" if run.smoke else ""))
            yaml, stats = export_dataset(out, subsets, obj)
            run.log(f"  {yaml} · " + " · ".join(f"{k}: {v['images']} ảnh / {v['boxes']} box" for k, v in stats.items()))
            summary["dataset"] = {"yaml": str(yaml), **stats}

            run.stage(f"train {p.epochs if not run.smoke else 1} epoch trên {device}")
            from ultralytics import YOLO

            t0 = time.perf_counter()
            done_before = 0.0  # giây đã train trước khi dừng (cột `time` của results.csv bắt đầu lại khi resume)
            last = run.dir / "train" / "weights" / "last.pt"
            if p.resume:
                if not last.exists():
                    raise FileNotFoundError(f"{last} không tồn tại — không train tiếp được")
                # Ultralytics đọc lại toàn bộ tham số train (data, epochs, freeze, optimizer…) từ checkpoint.
                done_before = train_csv_seconds(run.dir)
                run.log(f"  train tiếp từ {last} (đã train {done_before / 60:.0f} phút)")
                YOLO(str(last)).train(resume=True)
                summary["resumed"] = True
            else:
                base_path = MODELS_DIR / p.base
                model = YOLO(str(base_path) if base_path.exists() else p.base)
                model.train(data=str(yaml), epochs=1 if run.smoke else p.epochs, patience=p.patience,
                            imgsz=p.imgsz, batch=p.batch, device=device, workers=p.workers, seed=p.seed,
                            optimizer=p.optimizer, freeze=p.freeze or None, fraction=p.fraction,
                            project=str(run.dir), name="train", exist_ok=True, plots=True, verbose=False)
            summary["train_seconds"] = round(done_before + time.perf_counter() - t0, 1)
            best = run.dir / "train" / "weights" / "best.pt"
            ft_name = f"yolo26n-oi-{run.run_id}.pt"
            shutil.copy2(best, MODELS_DIR / ft_name)
            run.log(f"  → best.pt chép thành models/{ft_name} (train {summary['train_seconds'] / 60:.0f} phút)")

            run.stage("Ultralytics val trên test (mAP@50, mAP@50-95)")
            metrics = YOLO(str(best)).val(data=str(yaml), split="test", imgsz=p.imgsz, batch=p.batch, device=device,
                                          conf=p.conf, plots=False, project=str(run.dir), name="val_test",
                                          exist_ok=True, verbose=False)
            maps = list(metrics.box.maps)
            names = [classes[j]["oi_name"] for j in obj]
            summary["ultralytics_test"] = {
                "mAP50": float(metrics.box.map50), "mAP50_95": float(metrics.box.map),
                "mAP50_95_coco_classes": M.nanmean([maps[k] for k, j in enumerate(obj) if j in coco_cols]),
                "mAP50_95_gap_classes": M.nanmean([maps[k] for k, j in enumerate(obj) if j in gap_cols]),
                "speed_ms": {k: float(v) for k, v in metrics.speed.items()}}
            run.table("ultralytics_per_class", [{"class": n, "coco": classes[j].get("coco", ""), "mAP50_95": maps[k]}
                                                for k, (j, n) in enumerate(zip(obj, names))])
            u = summary["ultralytics_test"]
            run.log(f"  test mAP@50 {u['mAP50']:.4f} · mAP@50-95 {u['mAP50_95']:.4f} "
                    f"(COCO {u['mAP50_95_coco_classes']:.4f} · ngoài COCO {u['mAP50_95_gap_classes']:.4f})")
        summary["weights"] = ft_name

        # ── so với model gốc theo giao thức OI (giống E4) ─────────────────
        run.stage("detect val/test (gốc + fine-tune, pipeline app)")
        dets = {}
        for tag, w in (("base", p.base), ("ft", ft_name)):
            for name, sub in (("val", val), ("test", test)):
                dets[(tag, name)] = yolo_detections(sub.name, sub.image_ids, sub.paths(), p.root, w, p.conf,
                                                    p.imgsz, p.preprocess, p.device, run=run)
        names_of = {"base": {j: classes[j]["coco"] for j in coco_cols},
                    "ft": {j: classes[j]["oi_name"] for j in obj}}

        run.stage("detection AP@IoU (giao thức OI)")
        det_rows = []
        for tag, cmap in names_of.items():
            for j, n in cmap.items():
                r = detection_eval(test, dets[(tag, "test")], j, n, p.iou)
                det_rows.append({"model": tag, "class": classes[j]["oi_name"],
                                 "set": "coco" if j in coco_cols else "gap", "AP": r["AP"], "gt": r.get("n_gt"),
                                 "group_boxes": r["group_boxes"]})
        run.table("detection_ap", det_rows)

        def det_map(tag, s):
            return M.nanmean([r["AP"] for r in det_rows if r["model"] == tag and r["set"] == s])

        summary["oi_detection_AP50"] = {"base_coco": det_map("base", "coco"), "ft_coco": det_map("ft", "coco"),
                                        "ft_gap": det_map("ft", "gap")}

        run.stage("tag image-level")
        sets = {"coco": coco_cols, "gap": gap_cols, "objects": obj}
        S, thr, tag_rows = {}, {}, []
        for tag, cmap in names_of.items():
            Sv = image_scores_by_name(val, dets[(tag, "val")], cmap)
            St = image_scores_by_name(test, dets[(tag, "test")], cmap)
            free, strict = tune(Sv, val.Y, list(cmap), p.precision_target)
            S[tag], thr[tag] = (Sv, St), (free, strict)
            for set_name, cols in sets.items():
                cols = [c for c in cols if c in cmap]
                if not cols:
                    continue
                a = M.multilabel_summary(St, test.Y, free, cols=cols)
                b = M.multilabel_summary(St, test.Y, strict, cols=cols)
                tag_rows.append({"model": tag, "set": set_name, "classes": a["classes"], "mAP": a["mAP"],
                                 "macro_f1": a["macro_f1"], "macro_f1_at_precision": b["macro_f1"],
                                 "micro_precision_at_precision": b["micro_precision"]})
        run.table("tag_summary", tag_rows)
        summary["tag"] = tag_rows
        ap = {t: M.per_class_ap(S[t][1], test.Y) for t in S}
        run.table("per_class", [
            {"class": classes[j]["oi_name"], "set": "coco" if j in coco_cols else "gap",
             "train_boxes": sum(1 for v in subsets["train"].boxes.values() for b in v if b[0] == j),
             "test_pos": int((test.Y[:, j] == 1).sum()), "base_tag_AP": ap["base"][j] if j in coco_cols else None,
             "ft_tag_AP": ap["ft"][j],
             "base_det_AP": next((r["AP"] for r in det_rows if r["model"] == "base" and r["class"] == classes[j]["oi_name"]), None),
             "ft_det_AP": next((r["AP"] for r in det_rows if r["model"] == "ft" and r["class"] == classes[j]["oi_name"]), None)}
            for j in obj])

        if p.bootstrap and coco_cols:
            run.stage(f"bootstrap ghép cặp {p.bootstrap}×")

            def diff(idx):
                out = {}
                for k, name in ((0, "mAP"), (1, "macro_f1_at_precision")):
                    vals = []
                    for tag in ("ft", "base"):
                        t = thr[tag][0] if k == 0 else thr[tag][1]
                        r = M.multilabel_summary(S[tag][1][idx], test.Y[idx], t, cols=coco_cols)
                        vals.append(r["mAP"] if k == 0 else r["macro_f1"])
                    out[f"ft_minus_base_coco_{name}"] = vals[0] - vals[1]
                return out

            summary["paired_ci95"] = M.bootstrap_ci(diff, len(test.image_ids), p.bootstrap)

        if p.latency_images:
            run.stage(f"latency ({p.latency_images} ảnh test, pipeline app)")
            paths = test.paths()[: p.latency_images]
            summary["latency"] = {tag: measure_latency(w, paths, p.imgsz, p.preprocess, p.device)
                                  for tag, w in (("base", p.base), ("ft", ft_name))}
            for tag, v in summary["latency"].items():
                run.log(f"  {tag}: {v['ms_per_image']:.1f} ms/ảnh · {v['params_m']:.2f}M tham số · {v['file_mb']:.1f} MB")

        run.save_artifact("model.json", {"models_file": ft_name, "base": p.base, "classes": [classes[j]["oi_name"] for j in obj],
                                         "thresholds_strict": [float(thr["ft"][1][j]) if np.isfinite(thr["ft"][1][j]) else None
                                                               for j in obj], "precision_target": p.precision_target})
        run.save_artifact("scores.npz", {"ids_val": np.array(val.image_ids), "ids_test": np.array(test.image_ids),
                                         "S_val": S["ft"][0], "S_test": S["ft"][1],
                                         "covered": np.isin(np.arange(len(classes)), obj)})
        for t in tag_rows:
            run.log(f"  tag {t['model']:4s} {t['set']:7s} mAP {t['mAP']:.4f} · macro-F1 {t['macro_f1']:.4f} · "
                    f"F1@P {t['macro_f1_at_precision']:.4f}")
        run.summary = summary
    return run.summary

