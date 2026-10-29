"""Cấu hình C6: fine-tune TOÀN MẠNG YOLO26n-cls trên Places6 (task T1, 1 nhãn).

Khác linear probe (chỉ train lớp cuối trên feature đóng băng), ở đây mọi trọng số
của YOLO26n-cls (pretrain ImageNet, 2.8M tham số) được cập nhật. Kết quả ghi vào
cùng results/cls_eval.csv (config = yolo26n_cls_ft) để so trực tiếp với C1–C5.

Dùng đúng cách chia train/val/test của bench/cls_data.py (hash tên file). Ảnh
được symlink thành layout ImageFolder mà Ultralytics cần:
    $TNG_DATASETS/cls_places6_yolo/{train,val,test}/<tag>/*.jpg

Usage (từ ai-service/; weights: scripts/download_yolo_weight.py --model yolo26n-cls.pt):
    uv run python -m bench.cls_yolo_finetune                    # 30 epoch, 224 px, MPS
    uv run python -m bench.cls_yolo_finetune --epochs 5         # thử nhanh
    uv run python -m bench.cls_yolo_finetune --eval-only        # dùng lại best.pt, chỉ đánh giá
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np

from bench.cls_data import load_places6
from bench.cls_eval import CONFUSION_CSV, PER_TAG_CSV, RESULTS_CSV
from bench.cls_models import bootstrap_ci, confusion_rows, single_label_metrics
from bench.cls_taxonomy import TAXONOMY_VERSION
from bench.common import (
    DEFAULT_DATA_ROOT,
    MODELS_DIR,
    RUNS_DIR,
    append_csv,
    environment_info,
    sha256_of,
    utc_now,
)


def build_image_folder(ds, out: Path) -> Path:
    """Symlink ảnh Places6 thành train/val/test/<tag>/ (idempotent)."""
    for path, split, y in zip(ds.paths(), ds.split, ds.Y.argmax(1)):
        target = out / split / ds.tags[y] / path.name
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(path)
    return out


def previous_train_seconds(epochs: int):
    """Thời gian train của lần trước (cùng số epoch) — để --eval-only không làm mất số liệu."""
    import csv

    if not RESULTS_CSV.exists():
        return ""
    with open(RESULTS_CSV, newline="") as fh:
        rows = [r for r in csv.DictReader(fh)
                if r.get("config") == "yolo26n_cls_ft" and r.get("fit_s")
                and r.get("epochs") in (str(epochs), "")]
    return rows[-1]["fit_s"] if rows else ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Fine-tune YOLO26n-cls trên Places6.")
    parser.add_argument("--model", default="yolo26n-cls.pt")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--device", default="mps")
    parser.add_argument("--latency-images", type=int, default=100)
    parser.add_argument("--bootstrap", type=int, default=1000, help="CI 95%% (0 = tắt).")
    parser.add_argument("--eval-only", action="store_true",
                        help="Không train lại — đánh giá best.pt của lần train trước (cùng --epochs).")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    args = parser.parse_args()

    from ultralytics import YOLO

    weights = MODELS_DIR / args.model
    if not weights.exists():
        raise SystemExit(f"Thiếu {weights} — chạy: uv run python scripts/download_yolo_weight.py "
                         f"--model {args.model}")

    ds = load_places6(args.data_root)
    folder = build_image_folder(ds, args.data_root.expanduser().resolve() / "cls_places6_yolo")
    print(f"{ds.summary()}\n→ ImageFolder: {folder}", flush=True)

    run_name = f"{Path(args.model).stem}-places6-e{args.epochs}"
    best = RUNS_DIR / "cls_yolo" / run_name / "weights" / "best.pt"
    train_s = ""
    if args.eval_only:
        if not best.exists():
            raise SystemExit(f"--eval-only nhưng chưa có {best} — chạy không có cờ này trước.")
        print(f"→ dùng lại {best} (không train)", flush=True)
        train_s = previous_train_seconds(args.epochs)
    else:
        t0 = time.perf_counter()
        YOLO(str(weights)).train(
            data=str(folder), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch,
            device=args.device, project=str(RUNS_DIR / "cls_yolo"), name=run_name,
            exist_ok=True, seed=0, deterministic=True, plots=False, verbose=False)
        train_s = round(time.perf_counter() - t0, 1)
    model = YOLO(str(best))

    # Dự đoán test → metric giống hệt C1–C5 (xác suất theo thứ tự ds.tags).
    test_idx = ds.subset("test")
    paths = [ds.paths()[i] for i in test_idx]
    order = [list(model.names.values()).index(t) for t in ds.tags]
    P = []
    for start in range(0, len(paths), args.batch):
        for r in model.predict([str(p) for p in paths[start:start + args.batch]], imgsz=args.imgsz,
                               device=args.device, verbose=False):
            P.append(r.probs.data.cpu().numpy()[order])
    P = np.asarray(P)
    metrics = single_label_metrics(P, ds.Y[test_idx], ds.tags)
    per_tag = metrics.pop("per_tag")
    ci = bootstrap_ci(P, ds.Y[test_idx], True, n=args.bootstrap)

    # Latency batch 1 (gồm tiền xử lý của Ultralytics), sau 10 ảnh khởi động.
    sample = [str(p) for p in paths[: args.latency_images + 10]]
    for p in sample[:10]:
        model.predict(p, imgsz=args.imgsz, device=args.device, verbose=False)
    times = []
    for p in sample[10:]:
        t1 = time.perf_counter()
        model.predict(p, imgsz=args.imgsz, device=args.device, verbose=False)
        times.append(1000 * (time.perf_counter() - t1))

    row = {
        "taxonomy_version": TAXONOMY_VERSION, "image_preprocess": "raw", **environment_info(),
        "timestamp": utc_now(), "task": "T1", "dataset": ds.name, "config": "yolo26n_cls_ft",
        "features": "image (fine-tune toàn mạng)", "n_train": len(ds.subset("train")),
        "n_val": len(ds.subset("val")), "n_test": len(test_idx), "C": "", **metrics, **ci,
        "fit_s": train_s, "classifier_ms_per_image": round(float(np.mean(times)), 2),
        "feature_ms_per_image": 0.0, "epochs": args.epochs, "imgsz": args.imgsz,
        "params_m": round(sum(p.numel() for p in model.model.parameters()) / 1e6, 2),
        "model_mb": round(best.stat().st_size / 1e6, 2), "weights_sha256": sha256_of(best),
    }
    append_csv(RESULTS_CSV, row)
    for r in per_tag:
        append_csv(PER_TAG_CSV, {"timestamp": row["timestamp"], "dataset": ds.name,
                                 "config": "yolo26n_cls_ft", **r})
    for r in confusion_rows(P, ds.Y[test_idx], ds.tags):
        append_csv(CONFUSION_CSV, {"timestamp": row["timestamp"], "dataset": ds.name,
                                   "config": "yolo26n_cls_ft", **r})
    print(f"→ yolo26n_cls_ft top1 {metrics['top1']} · macro-F1 {metrics['macro_f1']} · "
          f"ECE {metrics['ece']} · {row['classifier_ms_per_image']} ms/ảnh\n→ {RESULTS_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
