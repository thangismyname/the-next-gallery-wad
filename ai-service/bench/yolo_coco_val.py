"""Tái lập bảng mAP COCO val2017 của YOLOv10 (paper) và YOLO26 (Ultralytics docs).

Mỗi (model × mode) chạy `model.val()` trên 5000 ảnh val2017, imgsz 640, rồi:
  - lấy mAP do Ultralytics tính (ultra_*),
  - tính lại mAP bằng pycocotools — evaluator chính thức của COCO (coco_*),
  - so với số công bố (published_*), ghi 1 dòng vào CSV kèm metadata môi trường.

Modes (Ultralytics `val` mặc định dùng head one-to-many + NMS cho CẢ HAI họ model):
  e2e  — head NMS-free one-to-one (`nms=False`)
         → YOLOv10: AP chính của paper · YOLO26: cột "mAPval 50-95(e2e)"
  nms  — head one-to-many + NMS ngoài (`nms=None`)
         → YOLOv10: AP† của paper      · YOLO26: cột "mAPval 50-95"

Usage (từ ai-service/, sau `python -m bench.download_coco`):
    uv run python -m bench.yolo_coco_val --models yolov10n yolov10s yolov10m   # tái lập YOLOv10
    uv run python -m bench.yolo_coco_val --models yolo26n yolo26s yolo26m      # YOLO26 để so với v10
    uv run python -m bench.yolo_coco_val --models yolov10n --modes e2e --limit 200   # smoke test
    uv run python -m bench.yolo_coco_val --models yolo26n --device cpu
"""
from __future__ import annotations

import argparse
import contextlib
import json
import time
from pathlib import Path

from bench.common import (
    DEFAULT_DATA_ROOT,
    MODELS_DIR,
    RESULTS_DIR,
    RUNS_DIR,
    append_csv,
    environment_info,
    sha256_of,
    utc_now,
)
from bench.download_coco import coco_dir, val_yaml_path
from bench.published import yolo_published

DEFAULT_CSV = RESULTS_DIR / "yolo_coco_val2017.csv"


def ensure_weights(model: str) -> Path:
    """models/<model>.pt — tải bằng Ultralytics nếu chưa có (cwd = models/)."""
    from ultralytics import YOLO

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / f"{model}.pt"
    if not path.exists():
        with contextlib.chdir(MODELS_DIR):
            YOLO(path.name)
    if not path.exists():
        raise FileNotFoundError(f"Không tải được weights {path}")
    return path


def subset_yaml(data_root: Path, limit: int) -> Path:
    """yaml chỉ gồm `limit` ảnh đầu (smoke test). Không chạy pycocotools với subset."""
    from ultralytics.utils import YAML

    root = coco_dir(data_root)
    lines = (root / "val2017.txt").read_text().splitlines()[:limit]
    subset_txt = root / f"val2017_first{limit}.txt"
    subset_txt.write_text("\n".join(lines) + "\n")
    data = YAML.load(val_yaml_path(data_root))
    data["train"] = data["val"] = subset_txt.name
    target = root / f"coco-val2017-first{limit}.yaml"
    YAML.save(target, data)
    return target


def pycocotools_map(predictions_json: Path, annotations_json: Path) -> tuple[float, float]:
    """mAP50-95, mAP50 (%) theo evaluator chính thức của COCO."""
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval

    with contextlib.redirect_stdout(None):
        gt = COCO(str(annotations_json))
        predictions = json.loads(predictions_json.read_text())
        if not predictions:
            return 0.0, 0.0
        dt = gt.loadRes(predictions)
        # imgIds mặc định = toàn bộ 5000 ảnh GT (đúng protocol COCO).
        evaluator = COCOeval(gt, dt, "bbox")
        evaluator.evaluate()
        evaluator.accumulate()
        evaluator.summarize()
    return round(evaluator.stats[0] * 100, 2), round(evaluator.stats[1] * 100, 2)


def run_one(model_name: str, mode: str, args: argparse.Namespace, data_yaml: Path) -> dict:
    from ultralytics import YOLO

    weights = ensure_weights(model_name)
    model = YOLO(str(weights))
    full_run = args.limit is None
    run_name = f"{model_name}-{mode}-{args.device}" + ("" if full_run else f"-first{args.limit}")

    started = time.perf_counter()
    metrics = model.val(
        data=str(data_yaml),
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        # None = NMS ngoài (head one-to-many); False = head NMS-free (end-to-end)
        nms=False if mode == "e2e" else None,
        save_json=full_run,
        plots=False,
        project=str(RUNS_DIR),
        name=run_name,
        exist_ok=True,
        verbose=False,
    )
    wall_s = time.perf_counter() - started

    coco_map = coco_map50 = ""
    predictions_json = Path(metrics.save_dir) / "predictions.json"
    annotations = coco_dir(args.data_root) / "annotations" / "instances_val2017.json"
    if full_run and predictions_json.exists() and annotations.exists():
        coco_map, coco_map50 = pycocotools_map(predictions_json, annotations)

    reference_table, source = yolo_published(model_name)
    published = (reference_table or {}).get(mode)
    ultra_map = round(metrics.box.map * 100, 2)
    reference = coco_map if coco_map != "" else ultra_map
    speed = metrics.speed  # ms/ảnh
    return {
        "timestamp": utc_now(),
        "model": model_name,
        "mode": mode,
        "device": args.device,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "images": args.limit or 5000,
        "ultra_map50_95": ultra_map,
        "ultra_map50": round(metrics.box.map50 * 100, 2),
        "coco_map50_95": coco_map,
        "coco_map50": coco_map50,
        "published_map50_95": published if published is not None else "",
        "published_source": source,
        "delta_vs_published": round(reference - published, 2)
        if published is not None and full_run
        else "",
        "preprocess_ms": round(speed.get("preprocess", 0.0), 2),
        "inference_ms": round(speed.get("inference", 0.0), 2),
        "postprocess_ms": round(speed.get("postprocess", 0.0), 2),
        "wall_s": round(wall_s, 1),
        "weights_sha256": sha256_of(weights),
        **environment_info(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="YOLO26 COCO val2017 reproduction.")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["yolov10n", "yolov10s", "yolov10m", "yolo26n", "yolo26s", "yolo26m"],
        help="Tên weights không kèm .pt (yolov10n..x, yolo26n..x).",
    )
    parser.add_argument("--modes", nargs="+", choices=["e2e", "nms"], default=["e2e", "nms"])
    parser.add_argument("--device", default="mps", help="mps | cpu")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--limit", type=int, default=None, help="Chỉ N ảnh đầu (smoke test).")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()

    data_yaml = val_yaml_path(args.data_root)
    if not data_yaml.exists():
        print(f"Chưa có {data_yaml} — chạy trước: python -m bench.download_coco")
        return 1
    if args.limit:
        data_yaml = subset_yaml(args.data_root, args.limit)
    # Smoke test ghi vào file riêng để không lẫn với kết quả chính thức.
    csv_path = args.csv if args.limit is None else args.csv.with_name(args.csv.stem + "_smoke.csv")

    for model_name in args.models:
        for mode in args.modes:
            print(f"\n=== {model_name} · {mode} · {args.device} ===", flush=True)
            row = run_one(model_name, mode, args, data_yaml)
            append_csv(csv_path, row)
            print(
                f"mAP50-95 ultralytics={row['ultra_map50_95']} "
                f"pycocotools={row['coco_map50_95'] or '-'} "
                f"published={row['published_map50_95'] or '-'} "
                f"Δ={row['delta_vs_published'] or '-'} | "
                f"inference {row['inference_ms']} ms/img | {row['wall_s']} s",
                flush=True,
            )
    print(f"\n→ {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
